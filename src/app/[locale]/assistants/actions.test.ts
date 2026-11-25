import {
  AuthApiError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
} from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { webSession } from "@/test-support/web-session";

const CLIENT = "5b88d492-348d-4f5a-8c00-55a8dfe0aee4";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  listGrants: vi.fn(),
  revokeGrant: vi.fn(),
  rows: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/cache", () => ({ refresh: mocks.refresh }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      ...webSession(mocks.getUser).auth,
      oauth: {
        listGrants: mocks.listGrants,
        revokeGrant: mocks.revokeGrant,
      },
    },
  }),
}));
vi.mock("@/core/db/client", () => ({
  sqlClient: (database: unknown) => database,
  getDatabaseConnection: () => ({ db: async () => mocks.rows() }),
}));

import { disconnect } from "./actions";

const user = {
  id: "user-1",
  email: "guest@example.com",
  email_confirmed_at: "2030-01-01",
  identities: [{ provider: "google" }],
};
const listed = {
  data: [
    {
      client: { id: CLIENT, name: "Claude" },
      scopes: ["openid"],
      granted_at: "2026-11-25T17:44:08.553565Z",
    },
  ],
  error: null,
};
const empty = { data: [], error: null };

function submit(clientId: string = CLIENT) {
  const form = new FormData();
  form.set("clientId", clientId);
  return disconnect(null, form);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  // A guest can disconnect while the feature is off.
  vi.stubEnv("ASSISTANT_ACCESS", "none");
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.getUser.mockResolvedValue({ data: { user } });
  mocks.rows.mockResolvedValue([]);
  mocks.listGrants.mockResolvedValue(listed);
  mocks.revokeGrant.mockResolvedValue({ data: {}, error: null });
});

describe("disconnect an assistant", () => {
  it("reports success only after the list no longer holds the assistant", async () => {
    mocks.listGrants.mockResolvedValueOnce(listed).mockResolvedValueOnce(empty);
    expect(await submit()).toEqual({ status: "disconnected" });
    expect(mocks.revokeGrant).toHaveBeenCalledExactlyOnceWith({
      clientId: CLIENT,
    });
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("reports a failure when the list still holds the assistant", async () => {
    expect(await submit()).toEqual({ status: "failed" });
  });

  it.each([
    ["is refused", new AuthApiError("no", 500, "unexpected_failure")],
    ["cannot be sent", new AuthRetryableFetchError("fetch failed", 0)],
  ])("trusts the list when the revoke call %s", async (_, error) => {
    mocks.revokeGrant.mockResolvedValue({ data: null, error });
    expect(await submit()).toEqual({ status: "failed" });
    // The answer was lost but the connection ended.
    mocks.listGrants.mockResolvedValueOnce(listed).mockResolvedValueOnce(empty);
    expect(await submit()).toEqual({ status: "disconnected" });
  });

  it("reports a failure when the list cannot be read again", async () => {
    mocks.listGrants.mockResolvedValueOnce(listed).mockResolvedValueOnce({
      data: null,
      error: new AuthRetryableFetchError("fetch failed", 0),
    });
    expect(await submit()).toEqual({ status: "failed" });
  });

  it.each(["", "other", "00000000-0000-4000-8000-000000000009"])(
    "refuses a forged client ID: %s",
    async (clientId) => {
      expect(await submit(clientId)).toEqual({ status: "gone" });
      expect(mocks.revokeGrant).not.toHaveBeenCalled();
    },
  );

  it("refuses a form without a client ID", async () => {
    expect(await disconnect(null, new FormData())).toEqual({ status: "gone" });
    expect(mocks.revokeGrant).not.toHaveBeenCalled();
  });

  it.each([
    ["sign_in", "the session ended", new AuthSessionMissingError()],
    ["sign_in", "Auth refuses the session", new AuthApiError("no", 403, "x")],
    [
      "off",
      "the OAuth server is off",
      new AuthApiError("off", 404, "feature_disabled"),
    ],
    ["failed", "Auth is down", new AuthRetryableFetchError("down", 503)],
  ])("answers %s when %s", async (status, _, error) => {
    mocks.listGrants.mockResolvedValue({ data: null, error });
    expect(await submit()).toEqual({ status });
    expect(mocks.revokeGrant).not.toHaveBeenCalled();
  });

  it("never lists for an account that is signed out", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect(await submit()).toEqual({ status: "sign_in" });
    expect(mocks.listGrants).not.toHaveBeenCalled();
  });

  it("keeps the row when a call throws", async () => {
    mocks.revokeGrant.mockRejectedValue(new Error("secret"));
    expect(await submit()).toEqual({ status: "failed" });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
      "secret",
    );
  });
});
