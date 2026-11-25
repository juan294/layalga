import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import {
  assistantFixtures,
  authCall,
  codeFlow,
  cookieClient,
  refreshClient,
  webSignIn,
  type FixtureUser,
} from "@/test-support/assistant-oauth";
import {
  localAdmin,
  localSupabase,
  localWebDatabase,
} from "@/test-support/local-supabase";

import {
  disconnectAssistant,
  listConnections,
  type ConnectionDeps,
} from "./connected-assistants";

const db = postgres(localSupabase().databaseUrl, { max: 2, prepare: false });
const admin = localAdmin();
const web = localWebDatabase();
const fixtures = assistantFixtures(db, admin);

afterEach(() => fixtures.cleanup());
afterAll(async () => {
  await Promise.all([db, admin, web.sql].map((sql) => sql.end({ timeout: 5 })));
});

async function depsFor(
  session: Pick<FixtureUser, "accessToken" | "refreshToken">,
): Promise<ConnectionDeps> {
  return { database: web.db, supabase: await cookieClient(session) };
}

async function clientIds(deps: ConnectionDeps) {
  const list = await listConnections(deps);
  if (list.status !== "ok") throw new Error(list.status);
  return list.connections.map(({ clientId }) => clientId);
}

describe("connected assistants on local Auth", { timeout: 60_000 }, () => {
  it("names an allowlisted assistant, and marks any other by its own name", async () => {
    const user = await fixtures.user();
    const known = await fixtures.client({ name: "Self-asserted name" });
    const unknown = await fixtures.client({ name: "Claude" });
    await codeFlow(user, known);
    await codeFlow(user, unknown);
    await admin`delete from public.assistant_clients where client_id=${unknown}`;
    // A disabled assistant stays recognizable, so the guest can disconnect it.
    await admin`update public.assistant_clients set enabled=false where client_id=${known}`;

    const list = await listConnections(await depsFor(user));
    expect(list).toEqual({
      status: "ok",
      connections: expect.arrayContaining([
        {
          clientId: known,
          assistant: "claude",
          clientName: "Self-asserted name",
          connectedAt: expect.any(String),
        },
        {
          clientId: unknown,
          assistant: null,
          clientName: "Claude",
          connectedAt: expect.any(String),
        },
      ]),
    });
  });

  it("disconnects one assistant at once and keeps the others", async () => {
    const user = await fixtures.user();
    const one = await fixtures.client();
    const two = await fixtures.client();
    const tokens = (await codeFlow(user, one)).body;
    await codeFlow(user, two);
    const deps = await depsFor(user);

    expect(await disconnectAssistant(one, deps)).toEqual({
      status: "disconnected",
    });
    expect(await clientIds(deps)).toEqual([two]);
    expect(
      (
        await authCall("GET", "/auth/v1/user", {
          token: String(tokens.access_token),
        })
      ).body.error_code,
    ).toBe("session_not_found");
    expect((await refreshClient(one, tokens.refresh_token)).status).toBe(400);
    // The guest's own web session is untouched.
    expect(await disconnectAssistant(one, deps)).toEqual({ status: "gone" });
  });

  it("refuses a client ID that is not in the caller's list", async () => {
    const owner = await fixtures.user();
    const other = await fixtures.user();
    const client = await fixtures.client();
    await codeFlow(owner, client);
    const deps = await depsFor(other);
    const revoke = vi.spyOn(deps.supabase.auth.oauth, "revokeGrant");

    for (const id of [client, randomUUID(), "", null, undefined, [client], 7])
      expect(await disconnectAssistant(id, deps)).toEqual({ status: "gone" });
    expect(revoke).not.toHaveBeenCalled();
    expect(await clientIds(deps)).toEqual([]);
    expect(await clientIds(await depsFor(owner))).toEqual([client]);
  });

  it("lets a guest who became a host disconnect", async () => {
    const user = await fixtures.user();
    const client = await fixtures.client();
    await codeFlow(user, client);
    await fixtures.host({ authUserId: user.id });
    const deps = await depsFor(user);

    expect(await clientIds(deps)).toEqual([client]);
    expect(await disconnectAssistant(client, deps)).toEqual({
      status: "disconnected",
    });
  });

  it("keeps the connection after a web sign-out on this device", async () => {
    const user = await fixtures.user();
    const client = await fixtures.client();
    const tokens = (await codeFlow(user, client)).body;
    const first = await depsFor(user);
    // The call that the sign-out route makes.
    await first.supabase.auth.signOut({ scope: "local" });

    expect(
      (
        await authCall("GET", "/auth/v1/user", {
          token: String(tokens.access_token),
        })
      ).status,
    ).toBe(200);
    const { data } = await (
      await cookieClient(await webSignIn(user))
    ).auth.oauth.listGrants();
    expect(data?.map((grant) => grant.client.id)).toEqual([client]);
  });

  it("asks for sign-in without a Google identity, with a client token, or after the session ended", async () => {
    const plain = await fixtures.user({ google: false });
    expect(await listConnections(await depsFor(plain))).toEqual({
      status: "sign_in",
    });

    const user = await fixtures.user();
    const client = await fixtures.client();
    const { body } = await codeFlow(user, client);
    const asClient = await depsFor({
      accessToken: String(body.access_token),
      refreshToken: String(body.refresh_token),
    });
    expect(await listConnections(asClient)).toEqual({ status: "sign_in" });
    expect(await disconnectAssistant(client, asClient)).toEqual({
      status: "sign_in",
    });

    const deps = await depsFor(user);
    await authCall("POST", "/auth/v1/logout?scope=local", {
      token: user.accessToken,
    });
    expect(await listConnections(deps)).toEqual({ status: "sign_in" });
  });
});
