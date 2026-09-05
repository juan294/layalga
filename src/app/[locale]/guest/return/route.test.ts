import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ exchange: vi.fn() }));
vi.mock("@/lib/auth/guest-email-session", () => ({
  setGuestEmailSession: mocks.exchange,
}));
import { GET } from "./route";

describe("guest reminder return GET", () => {
  beforeEach(() => vi.clearAllMocks());
  it("validates the capability and returns to its actual guest invitation without booking writes", async () => {
    mocks.exchange.mockResolvedValue({
      invitationId: "actual-invitation",
      locale: "es",
    });
    const response = await GET(
      new NextRequest(
        "https://example.com/en/guest/return?capability=signed-return&invitationId=forged",
      ),
      { params: Promise.resolve({ locale: "en" }) },
    );
    expect(mocks.exchange).toHaveBeenCalledWith("signed-return");
    expect(response.headers.get("location")).toBe("/es/guest");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });
  it("shows a branded recovery page for expired or revoked capabilities", async () => {
    mocks.exchange.mockResolvedValue(null);
    const response = await GET(
      new NextRequest("https://example.com/en/guest/return?capability=expired"),
      { params: Promise.resolve({ locale: "en" }) },
    );
    expect(response.headers.get("location")).toBe("/en/guest/verify?invalid=1");
  });
  it("keeps the redirect on the browser cookie host when Next's internal request URL differs", async () => {
    mocks.exchange.mockResolvedValue({
      invitationId: "actual-invitation",
      locale: "en",
    });
    const response = await GET(
      new NextRequest(
        "http://localhost:3008/en/guest/return?capability=valid",
        {
          headers: {
            host: "127.0.0.1:3008",
            "x-forwarded-host": "untrusted.example",
          },
        },
      ),
      { params: Promise.resolve({ locale: "en" }) },
    );
    const location = response.headers.get("location")!;
    expect(location).toBe("/en/guest");
    expect(new URL(location, "http://127.0.0.1:3008").origin).toBe(
      "http://127.0.0.1:3008",
    );
  });
});
