import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { getSessionUser, lookUpSessionUser } from "./session-user";

const user = { id: "user-1" };
const client = (verified: unknown, claims: Record<string, unknown> | null) =>
  ({
    auth: {
      getUser: async () => ({ data: { user: verified } }),
      getClaims: async () => ({ data: claims ? { claims } : null }),
    },
  }) as never;

describe("web session user", () => {
  it("returns the verified user of a direct sign-in", async () => {
    expect(
      await getSessionUser(
        client(user, { sub: "user-1", aud: ["authenticated"] }),
      ),
    ).toBe(user);
  });
  it("refuses a token issued to a connected OAuth client", async () => {
    expect(
      await getSessionUser(
        client(user, { sub: "user-1", aud: "authenticated", client_id: "c" }),
      ),
    ).toBeNull();
  });
  it("refuses any client_id claim, even an empty one", async () => {
    expect(
      await getSessionUser(
        client(user, { sub: "user-1", aud: "authenticated", client_id: "" }),
      ),
    ).toBeNull();
  });
  it("refuses a token meant for another audience", async () => {
    expect(
      await getSessionUser(
        client(user, { sub: "user-1", aud: "https://other.example/api/mcp" }),
      ),
    ).toBeNull();
  });
  it("refuses a session whose claims cannot be verified or name another user", async () => {
    expect(await getSessionUser(client(user, null))).toBeNull();
    expect(
      await getSessionUser(
        client(user, { sub: "user-2", aud: "authenticated" }),
      ),
    ).toBeNull();
    expect(
      await getSessionUser(
        client(null, { sub: "user-1", aud: "authenticated" }),
      ),
    ).toBeNull();
  });
});

describe("web session lookup", () => {
  const failing = (userError: unknown, claimsError?: unknown) =>
    ({
      auth: {
        getUser: async () =>
          claimsError
            ? { data: { user }, error: null }
            : { data: { user: null }, error: userError },
        getClaims: async () => ({ data: null, error: claimsError ?? null }),
      },
    }) as never;

  it("tells a signed-in user from a missing session", async () => {
    expect(
      await lookUpSessionUser(
        client(user, { sub: "user-1", aud: "authenticated" }),
      ),
    ).toEqual({ status: "signed_in", user });
    expect(
      await lookUpSessionUser(
        client(user, { sub: "user-1", aud: "authenticated", client_id: "c" }),
      ),
    ).toEqual({ status: "signed_out" });
    expect(
      await lookUpSessionUser(
        failing(new AuthApiError("gone", 403, "session_not_found")),
      ),
    ).toEqual({ status: "signed_out" });
  });

  it.each([
    ["cannot be reached", new AuthRetryableFetchError("fetch failed", 0)],
    ["fails", new AuthRetryableFetchError("unavailable", 503)],
    ["is busy", new AuthApiError("slow down", 429, "over_request_rate_limit")],
  ])("does not call a guest signed out when Auth %s", async (_, error) => {
    expect(await lookUpSessionUser(failing(error))).toEqual({
      status: "unavailable",
    });
    expect(await lookUpSessionUser(failing(null, error))).toEqual({
      status: "unavailable",
    });
    expect(await getSessionUser(failing(error))).toBeNull();
  });
});
