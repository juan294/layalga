import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ inspect: vi.fn(), verify: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", () => ({
  setRequestLocale: vi.fn(),
  getTranslations: async () => (key: string) => key,
}));
vi.mock("@/core/db/client", () => ({
  getDatabaseConnection: () => ({ db: "db" }),
}));
vi.mock("@/core/notifications/guest-contact", () => ({
  inspectGuestVerification: mocks.inspect,
  verifyGuestContact: mocks.verify,
}));
vi.mock("../email-actions", () => ({ confirmGuestEmail: vi.fn() }));
vi.mock("@/components/guest/guest-action-button", () => ({
  GuestActionButton: ({ label }: { label: string }) => <button>{label}</button>,
}));
import VerifyGuestEmailPage from "./page";

describe("verification GET review", () => {
  beforeEach(() => vi.clearAllMocks());
  it("renders an explicit confirmation without consuming the token or opting in", async () => {
    mocks.inspect.mockResolvedValue({ locale: "en" });
    const html = renderToStaticMarkup(
      await VerifyGuestEmailPage({
        params: Promise.resolve({ locale: "en" }),
        searchParams: Promise.resolve({ capability: "signed-verification" }),
      }),
    );
    expect(html).toContain("verifyTitle");
    expect(html).toContain('name="capability"');
    expect(mocks.inspect).toHaveBeenCalledWith(
      "db",
      "signed-verification",
      expect.anything(),
    );
    expect(mocks.verify).not.toHaveBeenCalled();
  });
  it("does not offer confirmation for replayed or expired tokens", async () => {
    mocks.inspect.mockResolvedValue(null);
    const html = renderToStaticMarkup(
      await VerifyGuestEmailPage({
        params: Promise.resolve({ locale: "es" }),
        searchParams: Promise.resolve({ capability: "expired" }),
      }),
    );
    expect(html).toContain("invalidLinkTitle");
    expect(html).not.toContain('name="capability"');
  });
});
