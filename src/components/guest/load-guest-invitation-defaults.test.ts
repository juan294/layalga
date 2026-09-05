import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ sql: vi.fn(), clock: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/core/db/client", () => ({
  getDatabaseConnection: () => ({ db: "db", sql: mocks.sql }),
}));
vi.mock("@/core/clock", () => ({ DbDemoClock: { load: mocks.clock } }));
import { loadGuestInvitationDefaults } from "./load-guest-invitation-defaults";

describe("trusted household guest defaults", () => {
  beforeEach(() => vi.clearAllMocks());
  it("loads the invitation home's demo clock and timezone for dates and synthetic labeling", async () => {
    mocks.sql.mockResolvedValue([{ timezone: "Europe/Madrid", demo: true }]);
    mocks.clock.mockResolvedValue({
      now: () => new Date("2027-01-31T23:30:00Z"),
    });
    const result = await loadGuestInvitationDefaults("trusted-home", {});
    expect(mocks.clock).toHaveBeenCalledWith("trusted-home", "db");
    expect(result).toMatchObject({
      demo: true,
      defaults: { from: "2027-02-08", to: "2027-02-18", nights: 2 },
    });
  });
  it("does not label an ordinary home synthetic", async () => {
    mocks.sql.mockResolvedValue([{ timezone: "UTC", demo: false }]);
    mocks.clock.mockResolvedValue({
      now: () => new Date("2027-02-01T10:00:00Z"),
    });
    expect(await loadGuestInvitationDefaults("real-home", {})).toMatchObject({
      demo: false,
    });
  });
});
