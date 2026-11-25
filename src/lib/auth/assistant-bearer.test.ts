import postgres from "postgres";
import {
  CompactSign,
  SignJWT,
  UnsecuredJWT,
  createLocalJWKSet,
  createRemoteJWKSet,
  customFetch,
  exportJWK,
  generateKeyPair,
} from "jose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { ASSISTANT_AUDIENCE } from "@/core/assistant-access/audience";
import { FakeClock } from "@/core/clock";

import { resolveAssistant, type AssistantBearerDeps } from "./assistant-bearer";

const NOW = new Date("2026-11-25T12:00:00Z");
const SUPABASE_URL = "https://project.example.test";
const USER = "7b1f2c9e-60f4-4a6a-9b53-0f6f6f0a2c11";
const CLIENT = "2f1a3c5d-9f2e-4b63-8b0e-5a4c3d2e1f00";
const SESSION = "c0a8012e-1111-4222-8333-444455556666";
const seconds = (offset: number) => Math.floor(NOW.getTime() / 1000) + offset;

// Nothing listens here, so a token that passes verification ends as
// "unavailable" at the first database read. Every earlier refusal is "refused".
const unreachable = postgres("postgresql://nobody@127.0.0.1:1/none", {
  max: 1,
  prepare: false,
  connect_timeout: 1,
});
let keys: Awaited<ReturnType<typeof generateKeyPair>>;
let deps: AssistantBearerDeps;
const fetchUser = vi.fn();

beforeAll(async () => {
  keys = await generateKeyPair("ES256");
  const jwk = {
    ...(await exportJWK(keys.publicKey)),
    alg: "ES256",
    kid: "current",
    use: "sig",
  };
  deps = {
    database: unreachable,
    clock: new FakeClock(NOW),
    supabase: { url: SUPABASE_URL, key: "publishable" },
    jwks: createLocalJWKSet({ keys: [jwk] }),
    fetch: fetchUser,
  };
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});
afterAll(async () => {
  await unreachable.end({ timeout: 1 });
});

const valid = () => ({
  iss: `${SUPABASE_URL}/auth/v1`,
  aud: ASSISTANT_AUDIENCE as unknown,
  sub: USER as unknown,
  client_id: CLIENT as unknown,
  session_id: SESSION as unknown,
  iat: seconds(-60) as unknown,
  exp: seconds(600) as unknown,
});

function sign(
  change: Record<string, unknown> = {},
  { key = keys.privateKey, kid = "current" as string | null } = {},
) {
  const payload: Record<string, unknown> = { ...valid(), ...change };
  for (const [name, value] of Object.entries(payload))
    if (value === undefined) delete payload[name];
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "ES256", typ: "JWT", ...(kid ? { kid } : {}) })
    .sign(key);
}

const resolve = async (
  header: string | null,
  change: Partial<AssistantBearerDeps> = {},
) => (await resolveAssistant(header, { ...deps, ...change })).status;

describe("resolveAssistant before the database", () => {
  it("accepts a valid token as far as the database", async () => {
    expect(await resolve(`Bearer ${await sign()}`)).toBe("unavailable");
    expect(await resolve(`bearer ${await sign()}`)).toBe("unavailable");
    expect(await resolve(`Bearer ${await sign({ exp: seconds(-4) })}`)).toBe(
      "unavailable",
    );
    expect(await resolve(`Bearer ${await sign({ iat: seconds(4) })}`)).toBe(
      "unavailable",
    );
  });

  it("reads the header only", async () => {
    const token = await sign();
    const request = new Request(
      `https://example.test/api/mcp?access_token=${token}`,
      {
        headers: { cookie: `sb-project-auth-token=${token}` },
      },
    );
    expect(await resolve(request.headers.get("authorization"))).toBe("refused");
  });

  it("refuses two headers", async () => {
    const token = await sign();
    const headers = new Headers();
    headers.append("authorization", `Bearer ${token}`);
    headers.append("authorization", `Bearer ${token}`);
    expect(await resolve(headers.get("authorization"))).toBe("refused");
  });

  it.each([
    null,
    "",
    "Bearer",
    "Bearer ",
    "Bearer a.b",
    "Bearer a.b.c",
    "Basic YTpi",
  ])("refuses the header %j", async (header) => {
    expect(await resolve(header)).toBe("refused");
  });

  it("refuses a malformed header around a valid token", async () => {
    const token = await sign();
    for (const header of [
      token,
      `Basic ${token}`,
      `Bearer ${token} extra`,
      `Bearer  ${token}`,
      ` Bearer ${token}`,
      `Bearer ${token}.x`,
      `Bearer ${token.slice(0, -4)}AAAA`,
    ])
      expect(await resolve(header), header).toBe("refused");
  });

  it.each<[string, Record<string, unknown>]>([
    ["another issuer", { iss: "https://other.example.test/auth/v1" }],
    ["no issuer", { iss: undefined }],
    ["expired", { exp: seconds(-6) }],
    ["no expiry", { exp: undefined }],
    ["no issue time", { iat: undefined }],
    ["issued in the future", { iat: seconds(6) }],
    ["a list audience", { aud: [ASSISTANT_AUDIENCE] }],
    ["two audiences", { aud: [ASSISTANT_AUDIENCE, "authenticated"] }],
    ["the web audience", { aud: "authenticated" }],
    ["a trailing slash audience", { aud: `${ASSISTANT_AUDIENCE}/` }],
    ["no audience", { aud: undefined }],
    ["no client_id", { client_id: undefined }],
    ["a malformed client_id", { client_id: "client" }],
    ["a list client_id", { client_id: [CLIENT] }],
    ["no subject", { sub: undefined }],
    ["a malformed subject", { sub: "user" }],
    ["no session_id", { session_id: undefined }],
    ["a malformed session_id", { session_id: "session" }],
  ])("refuses a token with %s", async (_name, change) => {
    expect(await resolve(`Bearer ${await sign(change)}`)).toBe("refused");
  });

  it("refuses another key, with and without its key ID", async () => {
    const { privateKey } = await generateKeyPair("ES256");
    for (const kid of ["current", "unknown", null])
      expect(
        await resolve(`Bearer ${await sign({}, { key: privateKey, kid })}`),
      ).toBe("refused");
  });

  it("refuses HS256 and unsigned tokens", async () => {
    const secret = new TextEncoder().encode("a-shared-secret-of-32-characters");
    const hs256 = await new SignJWT(valid() as Record<string, unknown>)
      .setProtectedHeader({ alg: "HS256", kid: "current" })
      .sign(secret);
    expect(await resolve(`Bearer ${hs256}`)).toBe("refused");
    const unsigned = new UnsecuredJWT(
      valid() as Record<string, unknown>,
    ).encode();
    expect(await resolve(`Bearer ${unsigned}`)).toBe("refused");
    expect(await resolve(`Bearer ${unsigned}c2ln`)).toBe("refused");
  });

  it("refuses another published algorithm", async () => {
    const rsa = await generateKeyPair("RS256");
    const jwks = createLocalJWKSet({
      keys: [{ ...(await exportJWK(rsa.publicKey)), alg: "RS256", kid: "rsa" }],
    });
    const token = await new SignJWT(valid() as Record<string, unknown>)
      .setProtectedHeader({ alg: "RS256", kid: "rsa" })
      .sign(rsa.privateKey);
    expect(await resolve(`Bearer ${token}`, { jwks })).toBe("refused");
  });

  it("refuses a token without a key ID while two keys are published", async () => {
    const publish = async (kid: string) => ({
      ...(await exportJWK((await generateKeyPair("ES256")).publicKey)),
      alg: "ES256",
      kid,
    });
    const jwks = createLocalJWKSet({
      keys: [await publish("old"), await publish("new")],
    });
    const token = await sign({}, { kid: null });
    expect(await resolve(`Bearer ${token}`, { jwks })).toBe("refused");
  });

  it("refuses a payload that is not an object and an unknown critical header", async () => {
    const list = await new CompactSign(new TextEncoder().encode("[]"))
      .setProtectedHeader({ alg: "ES256", kid: "current" })
      .sign(keys.privateKey);
    expect(await resolve(`Bearer ${list}`)).toBe("refused");
    const [, payload, signature] = (await sign()).split(".");
    const critical = Buffer.from(
      JSON.stringify({
        alg: "ES256",
        kid: "current",
        crit: ["other"],
        other: 1,
      }),
    ).toString("base64url");
    expect(await resolve(`Bearer ${critical}.${payload}.${signature}`)).toBe(
      "refused",
    );
  });

  it.each<[string, () => Promise<Response>]>([
    ["fails", async () => new Response("bad gateway", { status: 502 })],
    ["is not JSON", async () => new Response("<html>")],
    ["is not a key set", async () => Response.json({ message: "no" })],
    ["cannot be reached", () => Promise.reject(new TypeError("fetch failed"))],
    [
      "times out",
      () => Promise.reject(new DOMException("timed out", "TimeoutError")),
    ],
  ])("is unavailable when the key set %s", async (_name, answer) => {
    const jwks = createRemoteJWKSet(new URL(`${SUPABASE_URL}/jwks`), {
      [customFetch]: answer,
    });
    expect(await resolve(`Bearer ${await sign()}`, { jwks })).toBe(
      "unavailable",
    );
  });

  it("refuses an unknown key ID of a remote key set that answers", async () => {
    const jwk = {
      ...(await exportJWK(keys.publicKey)),
      alg: "ES256",
      kid: "current",
    };
    const jwks = createRemoteJWKSet(new URL(`${SUPABASE_URL}/jwks`), {
      [customFetch]: async () => Response.json({ keys: [jwk] }),
    });
    expect(
      await resolve(`Bearer ${await sign({}, { kid: "unknown" })}`, { jwks }),
    ).toBe("refused");
    expect(await resolve(`Bearer ${await sign()}`, { jwks })).toBe(
      "unavailable",
    );
  });

  it("never asks Auth for a token that it cannot place", () => {
    expect(fetchUser).not.toHaveBeenCalled();
  });

  it("logs a category without the token or an identity", async () => {
    vi.mocked(console.info).mockClear();
    vi.mocked(console.error).mockClear();
    const token = await sign();
    await resolve(`Bearer ${token}`);
    await resolve(`Bearer ${await sign({ aud: "authenticated" })}`);
    expect(vi.mocked(console.error).mock.calls).toEqual([
      ["[ASSISTANT_AUTH]", { outcome: "unavailable_database" }],
    ]);
    expect(vi.mocked(console.info).mock.calls).toEqual([
      ["[ASSISTANT_AUTH]", { outcome: "refused_token" }],
    ]);
  });
});
