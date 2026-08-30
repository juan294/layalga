import { describe, expect, it, vi } from "vitest";

import { DbDemoClock, FakeClock, SystemClock } from "./clock";

describe("clocks", () => {
  it("lets a fake clock move deterministically", () => {
    const clock = new FakeClock(new Date("2026-09-07T08:00:00.000Z"));

    clock.advance(60_000);
    expect(clock.now().toISOString()).toBe("2026-09-07T08:01:00.000Z");

    clock.set(new Date("2026-09-15T07:00:00.000Z"));
    expect(clock.now().toISOString()).toBe("2026-09-15T07:00:00.000Z");
  });

  it("returns defensive Date copies", () => {
    const clock = new FakeClock(new Date("2026-09-07T08:00:00.000Z"));
    const result = clock.now();

    result.setUTCFullYear(2000);

    expect(clock.now().getUTCFullYear()).toBe(2026);
  });

  it("uses the database clock only for an enabled demo home", async () => {
    const fallback = new FakeClock(new Date("2026-09-01T00:00:00.000Z"));
    const read = vi.fn().mockResolvedValue({
      enabled: true,
      homeDemo: true,
      now: "2026-09-07T08:00:00.000Z",
    });

    const clock = await DbDemoClock.load("home-1", { read }, fallback);

    expect(read).toHaveBeenCalledWith("home-1");
    expect(clock.now().toISOString()).toBe("2026-09-07T08:00:00.000Z");
  });

  it.each([
    { enabled: false, homeDemo: true },
    { enabled: true, homeDemo: false },
    null,
  ])(
    "falls back when the database clock is unavailable or disabled",
    async (record) => {
      const fallback = new FakeClock(new Date("2026-09-01T00:00:00.000Z"));
      const clock = await DbDemoClock.load(
        "home-1",
        {
          read: vi
            .fn()
            .mockResolvedValue(
              record && { ...record, now: "2026-09-07T08:00:00.000Z" },
            ),
        },
        fallback,
      );

      expect(clock.now().toISOString()).toBe("2026-09-01T00:00:00.000Z");
    },
  );

  it("system time is close to the current time", () => {
    const before = Date.now();
    const result = new SystemClock().now().getTime();
    const after = Date.now();

    expect(result).toBeGreaterThanOrEqual(before);
    expect(result).toBeLessThanOrEqual(after);
  });
});
