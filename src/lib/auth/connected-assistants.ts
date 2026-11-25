import "@/core/server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  listAllowlistedClients,
  type AssistantName,
} from "@/core/assistant-access/clients";
import type { DatabaseClient } from "@/core/db/client";
import { reportActionError } from "@/lib/server/action-errors";

import { oauthServerFailure } from "./oauth-server-errors";
import { lookUpSessionUser } from "./session-user";
import { verifiedGoogleGuestEmail } from "./verified-guest-email";

export interface ConnectedAssistant {
  clientId: string;
  /** Null when the allowlist does not hold the client. */
  assistant: AssistantName | null;
  /** What the client called itself. Show it only as unrecognized. */
  clientName: string;
  connectedAt: string;
}

export type Connections =
  | { status: "ok"; connections: ConnectedAssistant[] }
  | { status: "sign_in" | "off" | "unavailable" };

export type DisconnectResult = {
  status: "disconnected" | "failed" | "gone" | "sign_in" | "off";
};

export interface ConnectionDeps {
  database: DatabaseClient;
  supabase: Pick<SupabaseClient, "auth">;
}

/** Hosts too: a guest can become a host after connecting an assistant. */
export async function listConnections(
  deps: ConnectionDeps,
): Promise<Connections> {
  try {
    const grants = await listGrants(deps.supabase);
    if (grants.status !== "ok") return grants;
    const allowlist = await listAllowlistedClients(deps.database);
    return {
      status: "ok",
      connections: grants.grants.map(({ client, granted_at }) => ({
        clientId: client.id,
        assistant:
          allowlist.find(({ clientId }) => clientId === client.id)?.assistant ??
          null,
        clientName: client.name,
        connectedAt: granted_at,
      })),
    };
  } catch (error) {
    reportActionError("assistant_list_failed", error);
    return { status: "unavailable" };
  }
}

/** Only the list that Auth returns afterwards proves that a connection ended. */
export async function disconnectAssistant(
  clientId: unknown,
  { supabase }: Pick<ConnectionDeps, "supabase">,
): Promise<DisconnectResult> {
  try {
    const before = await listGrants(supabase);
    if (before.status !== "ok") return undecided(before.status);
    const grant = before.grants.find(({ client }) => client.id === clientId);
    if (!grant) return { status: "gone" };

    const { error } = await supabase.auth.oauth.revokeGrant({
      clientId: grant.client.id,
    });
    if (error) reportActionError("assistant_disconnect_failed", error);

    const after = await listGrants(supabase);
    if (after.status !== "ok") return undecided(after.status);
    return after.grants.some(({ client }) => client.id === clientId)
      ? { status: "failed" }
      : { status: "disconnected" };
  } catch (error) {
    reportActionError("assistant_disconnect_failed", error);
    return { status: "failed" };
  }
}

function undecided(
  status: "sign_in" | "off" | "unavailable",
): DisconnectResult {
  return { status: status === "unavailable" ? "failed" : status };
}

async function listGrants(supabase: ConnectionDeps["supabase"]) {
  const session = await lookUpSessionUser(supabase);
  if (session.status === "unavailable")
    return { status: "unavailable" } as const;
  if (session.status !== "signed_in" || !verifiedGoogleGuestEmail(session.user))
    return { status: "sign_in" } as const;
  const { data, error } = await supabase.auth.oauth.listGrants();
  if (!error) return { status: "ok", grants: data } as const;
  const failure = oauthServerFailure(error);
  if (failure === "off" || failure === "sign_in")
    return { status: failure } as const;
  reportActionError("assistant_list_failed", error);
  return { status: "unavailable" } as const;
}
