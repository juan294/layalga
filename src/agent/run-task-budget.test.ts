import { describe, expect, it } from "vitest";

import { workerBudgetMs } from "./run-task";

describe("workerBudgetMs", () => {
  it("stops the worker before the recovery deadline", () => {
    expect(workerBudgetMs(235_000)).toBe(230_000);
    expect(workerBudgetMs(100_000)).toBe(95_000);
  });

  it("never exceeds the 4-minute worker budget", () => {
    expect(workerBudgetMs(240_000)).toBe(235_000);
    expect(workerBudgetMs(600_000)).toBe(240_000);
    expect(workerBudgetMs(null)).toBe(240_000);
  });

  it("aborts immediately when the deadline has passed", () => {
    expect(workerBudgetMs(3_000)).toBe(0);
    expect(workerBudgetMs(-10)).toBe(0);
  });
});
