import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ sql: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/core/db/client", () => ({
  getDatabaseConnection: () => ({ db: "db", sql: mocks.sql }),
}));
import { loadGuestInvitationDefaults } from "./load-guest-invitation-defaults";

describe("trusted household guest defaults", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it("uses the current time and the invitation home's timezone for dates", async () => {
    vi.setSystemTime(new Date("2027-01-31T23:30:00Z"));
    mocks.sql.mockResolvedValue([{ timezone: "Europe/Madrid" }]);
    const result = await loadGuestInvitationDefaults("trusted-home", {});
    expect(result).toEqual({
      timeZone: "Europe/Madrid",
      now: "2027-01-31T23:30:00.000Z",
      defaults: expect.objectContaining({
        from: "2027-02-08",
        to: "2027-02-18",
        nights: 2,
      }),
    });
  });

  it("rejects an unknown home", async () => {
    mocks.sql.mockResolvedValue([]);
    await expect(loadGuestInvitationDefaults("missing", {})).rejects.toThrow(
      "Invitation home unavailable",
    );
  });
});
