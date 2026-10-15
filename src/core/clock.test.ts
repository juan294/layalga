import { describe, expect, it } from "vitest";

import { FakeClock, SystemClock } from "./clock";

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

  it("system time is close to the current time", () => {
    const before = Date.now();
    const result = new SystemClock().now().getTime();
    const after = Date.now();

    expect(result).toBeGreaterThanOrEqual(before);
    expect(result).toBeLessThanOrEqual(after);
  });
});
