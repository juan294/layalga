import "@/core/server-only";

import type { TransactionSql } from "postgres";

export async function lockHomeAndHost(
  transaction: TransactionSql,
  homeId: string,
  hostId: string,
): Promise<void> {
  const [home] = await transaction<{ id: string }[]>`
    select id from public.homes where id = ${homeId} for update
  `;
  if (!home) throw new Error(`Home not found: ${homeId}`);
  const [host] = await transaction<{ id: string }[]>`
    select id from public.hosts where id = ${hostId} and home_id = ${homeId}
  `;
  if (!host) throw new Error("Host does not belong to this home");
}

export async function auditHostAction(
  transaction: TransactionSql,
  homeId: string,
  kind: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await transaction`
    insert into public.audit_events (home_id, actor, kind, payload)
    values (${homeId}, 'host', ${kind}, ${JSON.stringify(payload)}::text::jsonb)
  `;
}
