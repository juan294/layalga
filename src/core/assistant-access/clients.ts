import { sqlClient, type DatabaseClient } from "@/core/db/client";

export type AssistantName = "claude" | "chatgpt";

export interface AssistantClient {
  clientId: string;
  assistant: AssistantName;
}

/** The clients that may connect now, each with its exact callback. */
export async function listEnabledClients(
  database: DatabaseClient,
): Promise<(AssistantClient & { redirectUri: string })[]> {
  return sqlClient(database)<(AssistantClient & { redirectUri: string })[]>`
    select client_id as "clientId", assistant, redirect_uri as "redirectUri"
    from public.assistant_clients where enabled
  `;
}

/** Also disabled clients: a guest can still hold a connection to one. */
export async function listKnownClients(
  database: DatabaseClient,
): Promise<AssistantClient[]> {
  return sqlClient(database)<AssistantClient[]>`
    select client_id as "clientId", assistant from public.assistant_clients
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
