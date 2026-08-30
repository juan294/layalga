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
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

export class PostgresStorage implements Storage {
  constructor(
    private readonly sql: SqlClient,
    private readonly sessionId: string,
    private readonly prefix = "",
  ) {}

  async write(key: string, data: Uint8Array): Promise<void> {
    const fullKey = this.key(key);

    await this.sql`
      insert into public.agent_sessions (key, session_id, data)
      values (${fullKey}, ${this.sessionId}, ${data})
      on conflict (key) do update
      set
        session_id = excluded.session_id,
        data = excluded.data,
        updated_at = now()
    `;
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
    await this.sql`
      delete from public.agent_sessions
      where key = ${this.key(key)}
    `;
  }

  async list(prefix: string): Promise<string[]> {
    const normalizedPrefix = normalizePath(prefix, true);
    const requestedPrefix =
      normalizedPrefix && prefix.endsWith("/") ? `${normalizedPrefix}/` : normalizedPrefix;
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
    return new PostgresStorage(this.sql, this.sessionId, joined);
  }

  private key(key: string): string {
    const normalizedKey = normalizePath(key, false);
    return [this.prefix, normalizedKey].filter(Boolean).join("/");
  }
}
