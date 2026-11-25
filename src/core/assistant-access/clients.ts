import { sqlClient, type DatabaseClient } from "@/core/db/client";

export type AssistantName = "claude" | "chatgpt";

export interface AssistantClient {
  clientId: string;
  assistant: AssistantName;
}

/** A row of the allowlist, enabled or not. */
export interface AllowlistedClient extends AssistantClient {
  redirectUri: string;
  enabled: boolean;
}

/** The whole allowlist: one row for each registered assistant. */
export async function listAllowlistedClients(
  database: DatabaseClient,
): Promise<AllowlistedClient[]> {
  return sqlClient(database)<AllowlistedClient[]>`
    select client_id as "clientId", assistant, redirect_uri as "redirectUri", enabled
    from public.assistant_clients
  `;
}

/** The allowlist row is also the fastest switch to stop one client. */
export async function enabledClient(
  database: DatabaseClient,
  clientId: string,
): Promise<AssistantClient | null> {
  const [client] = await sqlClient(database)<AssistantClient[]>`
    select client_id as "clientId", assistant from public.assistant_clients
    where client_id = ${clientId} and enabled
  `;
  return client ?? null;
}
