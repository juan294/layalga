import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = {
  exchangeCodeForSession: vi.fn(),
  getUser: vi.fn(),
  signOut: vi.fn(),
};
const claimHostForUser = vi.fn();
const claimPartyForUser = vi.fn();
const hasPartyForUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth }),
}));
vi.mock("@/lib/auth/current-host", () => ({
  claimHostForUser: (...args: unknown[]) => claimHostForUser(...args),
}));
vi.mock("@/lib/auth/party-claim", () => ({
  claimPartyForUser: (...args: unknown[]) => claimPartyForUser(...args),
}));
vi.mock("@/lib/auth/guest-account", () => ({
  hasPartyForUser: (...args: unknown[]) => hasPartyForUser(...args),
}));

import { GET } from "./route";

const user = { id: "user-1", email: "guest@example.com" };

describe("OAuth callback from the main sign-in page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.exchangeCodeForSession.mockResolvedValue({ error: null });
    auth.getUser.mockResolvedValue({ data: { user } });
    auth.signOut.mockResolvedValue({ error: null });
    claimHostForUser.mockResolvedValue(false);
    claimPartyForUser.mockResolvedValue(false);
    hasPartyForUser.mockResolvedValue(false);
  });

  it.each([
    "/en/stays?q=La+Yalga",
    "/es/stays/eab9e960-0b40-4f02-8fa8-6df08829cb96?from=2030-12-10&nights=14",
    "/en/requests",
    "/es/requests/review",
    "/es/requests/eab9e960-0b40-4f02-8fa8-6df08829cb96",
  ])(
    "opens only the request view for a verified first-time Google guest: %s",
    async (path) => {
      auth.getUser.mockResolvedValue({
        data: {
          user: {
            ...user,
            email_confirmed_at: "2030-01-01",
            identities: [{ provider: "google" }],
          },
        },
      });
      expect(location(await GET(callback(path)))).toBe(path);
      expect(auth.signOut).not.toHaveBeenCalled();
      if (path.includes("/stays"))
        expect(claimHostForUser).toHaveBeenCalledOnce();
      else expect(claimHostForUser).not.toHaveBeenCalled();
      expect(claimPartyForUser).not.toHaveBeenCalled();
      expect(hasPartyForUser).not.toHaveBeenCalled();
    },
  );

  it("opens discovery for a new verified guest from the Google sign-in page", async () => {
    auth.getUser.mockResolvedValue({
      data: {
        user: {
          ...user,
          email_confirmed_at: "2030-01-01",
          identities: [{ provider: "google" }],
        },
      },
    });
    expect(location(await GET(callback("/es")))).toBe("/es/stays");
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it.each(["unverified", "cancelled"])(
    "preserves the booking search for an OAuth retry (%s)",
    async (reason) => {
      const path = "/es/stays?q=Pe%C3%B1a";
      const req = callback(path);
      if (reason === "cancelled")
        auth.exchangeCodeForSession.mockResolvedValue({ error: "cancelled" });
      const location = new URL((await GET(req)).headers.get("location")!);
      expect(location.pathname).toBe("/es/sign-in");
      expect(location.searchParams.get("next")).toBe(path);
      expect(location.searchParams.get("error")).toBe("oauth_failed");
    },
  );

  it("keeps a cancelled Google flow on the same request review", async () => {
    const response = await GET(
      new NextRequest(
        "https://layalga.example/auth/callback?next=%2Fes%2Frequests%2Freview",
      ),
    );
    expect(location(response)).toBe("/es/requests/review?auth=failed");
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("rejects an unverified identity on requester routes", async () => {
    expect(location(await GET(callback("/en/requests")))).toBe(
      "/en/requests?auth=failed",
    );
    expect(auth.signOut).toHaveBeenCalledOnce();
    expect(claimHostForUser).not.toHaveBeenCalled();
  });

  it("preserves unrelated account rejection for similar and noncanonical paths", async () => {
    auth.getUser.mockResolvedValue({
      data: {
        user: {
          ...user,
          email_confirmed_at: "2030-01-01",
          identities: [{ provider: "google" }],
        },
      },
    });
    for (const path of [
      "/en/stays/../rooms",
      "/en/stays?q=home&q=other",
      "/en/stays?from=bad",
      "/en/stays/%2F%2Fevil.example",
      "/en/requests-admin",
      "/en/requests/elsewhere",
      "/en/requests/../rooms",
      "/en/requests?next=/en/rooms",
    ]) {
      expect(location(await GET(callback(path)))).toBe(
        "/en/sign-in?error=not_a_host",
      );
    }
  });

  it("keeps a host on the requested page", async () => {
    claimHostForUser.mockResolvedValue(true);

    const response = await GET(callback("/es"));

    expect(location(response)).toBe("/es");
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("sends an invited guest with a claimed invitation to their visits", async () => {
    hasPartyForUser.mockResolvedValue(true);

    const response = await GET(callback("/es"));

    expect(location(response)).toBe("/es/visits");
    expect(hasPartyForUser).toHaveBeenCalledWith("user-1");
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("ignores the requested page for a guest and keeps only its locale", async () => {
    hasPartyForUser.mockResolvedValue(true);

    expect(location(await GET(callback("/es/settings")))).toBe("/es/visits");
    expect(location(await GET(callback("/api/x")))).toBe("/en/visits");
  });

  it("treats someone who is both host and guest as a host", async () => {
    claimHostForUser.mockResolvedValue(true);
    hasPartyForUser.mockResolvedValue(true);

    const response = await GET(callback("/en/rooms"));

    expect(location(response)).toBe("/en/rooms");
    expect(hasPartyForUser).not.toHaveBeenCalled();
  });

  it("does not fall back to the visits page after a failed invitation claim", async () => {
    hasPartyForUser.mockResolvedValue(true);
    const token = "a".repeat(43);

    const response = await GET(callback(`/en/g/${token}`));

    expect(location(response)).toBe(`/en/g/${token}?claim=failed`);
    expect(claimHostForUser).not.toHaveBeenCalled();
    expect(auth.signOut).toHaveBeenCalledOnce();
  });

  it("returns to sign-in with a retry message when Google sends no code, as after a dismissed picker", async () => {
    const response = await GET(
      new NextRequest("https://layalga.example/auth/callback?next=%2Fen"),
    );

    expect(location(response)).toBe("/en/sign-in?error=oauth_failed");
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("signs out an unverified account with no host or invitation claim", async () => {
    const response = await GET(callback("/en"));

    expect(location(response)).toBe("/en/sign-in?error=not_a_host");
    expect(auth.signOut).toHaveBeenCalledOnce();
  });
});

function callback(next: string): NextRequest {
  return new NextRequest(
    `https://layalga.example/auth/callback?code=abc&next=${encodeURIComponent(next)}`,
  );
}

function location(response: Response): string {
  const url = new URL(response.headers.get("location") ?? "");
  return `${url.pathname}${url.search}`;
}
