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

  it("signs out an account that is neither a host nor an invited guest", async () => {
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
