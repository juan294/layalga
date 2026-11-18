import type { Storage } from "@strands-agents/sdk";

import type { SqlClient } from "@/core/db/client";

function normalizePath(value: string, allowEmpty: boolean): string {
  const segments = value.split("/").filter(Boolean);

  if (segments.includes("..")) {
    throw new Error(`Invalid storage path: ${value}`);
  }

  if (!allowEmpty && segments.length === 0) {
    throw new Error("Storage key must not be empty");
  }

  return segments.join("/");
}

function escapeLike(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");
}

/** The queue claim that authorizes session writes for one agent run. */
export interface SessionLease {
  runId: string;
  claimToken: string;
}

export class LeaseLostError extends Error {
  constructor(runId: string) {
    super(`Agent run is no longer active: ${runId}`);
  }
}

export class PostgresStorage implements Storage {
  constructor(
    private readonly sql: SqlClient,
    private readonly sessionId: string,
    private readonly prefix = "",
    private readonly lease?: SessionLease,
  ) {}

  /**
   * With a lease, a write or delete lands only while the run still holds its
   * claim. The share lock on the run row makes a concurrent lease recovery wait
   * for this single statement, so no transaction stays open during model work.
   */
  async write(key: string, data: Uint8Array): Promise<void> {
    const fullKey = this.key(key);
    if (!this.lease) {
      await this.sql`
        insert into public.agent_sessions (key, session_id, data)
        values (${fullKey}, ${this.sessionId}, ${data})
        on conflict (key) do update
        set
          session_id = excluded.session_id,
          data = excluded.data,
          updated_at = now()
      `;
      return;
    }
    const written = await this.sql<{ key: string }[]>`
      with lease as (
        select id from public.runs
        where id = ${this.lease.runId} and status = 'running'
          and queue_claim_token = ${this.lease.claimToken}
        for share
      )
      insert into public.agent_sessions (key, session_id, data)
      select ${fullKey}, ${this.sessionId}, ${data} from lease
      on conflict (key) do update
      set
        session_id = excluded.session_id,
        data = excluded.data,
        updated_at = now()
      returning key
    `;
    if (written.length === 0) throw new LeaseLostError(this.lease.runId);
  }

  async read(key: string): Promise<Uint8Array | null> {
    const [row] = await this.sql<{ data: Uint8Array }[]>`
      select data
      from public.agent_sessions
      where key = ${this.key(key)}
    `;

    return row ? new Uint8Array(row.data) : null;
  }

  async delete(key: string): Promise<void> {
    const fullKey = this.key(key);
    if (!this.lease) {
      await this.sql`delete from public.agent_sessions where key = ${fullKey}`;
      return;
    }
    const [lease] = await this.sql<{ id: string }[]>`
      with lease as (
        select id from public.runs
        where id = ${this.lease.runId} and status = 'running'
          and queue_claim_token = ${this.lease.claimToken}
        for share
      ), removed as (
        delete from public.agent_sessions
        where key = ${fullKey} and exists (select 1 from lease)
      )
      select id from lease
    `;
    if (!lease) throw new LeaseLostError(this.lease.runId);
  }

  async list(prefix: string): Promise<string[]> {
    const normalizedPrefix = normalizePath(prefix, true);
    const requestedPrefix =
      normalizedPrefix && prefix.endsWith("/")
        ? `${normalizedPrefix}/`
        : normalizedPrefix;
    const namespacePrefix = this.prefix ? `${this.prefix}/` : "";
    const fullPrefix = `${namespacePrefix}${requestedPrefix}`;
    const rows = await this.sql<{ key: string }[]>`
      select key
      from public.agent_sessions
      where key like ${`${escapeLike(fullPrefix)}%`} escape '\\'
      order by key
    `;

    return rows.map((row) => row.key.slice(namespacePrefix.length));
  }

  namespace(prefix: string): Storage {
    const normalizedPrefix = normalizePath(prefix, true);
    const joined = [this.prefix, normalizedPrefix].filter(Boolean).join("/");
    return new PostgresStorage(this.sql, this.sessionId, joined, this.lease);
  }

  private key(key: string): string {
    const normalizedKey = normalizePath(key, false);
    return [this.prefix, normalizedKey].filter(Boolean).join("/");
  }
}
