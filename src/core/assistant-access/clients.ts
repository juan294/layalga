import { sqlClient, type DatabaseClient } from "@/core/db/client";

export type AssistantName = "claude" | "chatgpt";

export interface AssistantClient {
  clientId: string;
  assistant: AssistantName;
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
