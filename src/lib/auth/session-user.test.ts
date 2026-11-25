import { describe, expect, it } from "vitest";

import { getSessionUser } from "./session-user";

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
