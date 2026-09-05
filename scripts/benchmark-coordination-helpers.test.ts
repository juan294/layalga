import { describe, expect, it } from "vitest";

import {
  assertBenchmarkHealth,
  benchmarkConfiguration,
  isBenchmarkRequestAllowed,
  summarizeBenchmarkActions,
} from "./benchmark-coordination-helpers";

const environment = {
  APP_URL: "http://127.0.0.1:3008",
  DATABASE_URL: "postgresql://postgres:private@127.0.0.1:54622/postgres",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54621",
  MODEL: "scripted",
  AGENT_RUNTIME: "local",
  EMAIL: "none",
  MEMORY: "none",
  SCHEDULER: "none",
  DEMO_MODE: "true",
};

describe("local synthetic coordination benchmark boundary", () => {
  it("accepts explicit local-only configuration without exposing database credentials", () => {
    const config = benchmarkConfiguration(environment);
    expect(config.baseUrl).toBe(environment.APP_URL);
    expect(JSON.stringify(config.publicConfiguration)).not.toContain("private");
    expect(config.publicConfiguration).toMatchObject({
      model: "scripted",
      agentRuntime: "local",
      email: "none",
    });
  });

  it.each([
    { APP_URL: "https://layalga.thecreativetoken.com" },
    {
      DATABASE_URL:
        "postgresql://runtime:private@database.example.test/postgres",
    },
    { DATABASE_URL: environment.DATABASE_URL + "?host=remote.example.test" },
    { NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co" },
    { MODEL: "bedrock" },
    { AGENT_RUNTIME: "agentcore" },
    { EMAIL: "ses" },
    { MEMORY: "agentcore" },
    { SCHEDULER: "eventbridge" },
    { DEMO_MODE: "false" },
    { MODEL: undefined },
  ])("rejects unsafe or implicit configuration %o", (override) => {
    expect(() =>
      benchmarkConfiguration({ ...environment, ...override }),
    ).toThrow();
  });

  it("rejects remote redirects and unexpected local navigation origins", () => {
    const config = benchmarkConfiguration(environment);
    expect(
      isBenchmarkRequestAllowed(config, `${config.baseUrl}/en/guest`, true),
    ).toBe(true);
    expect(
      isBenchmarkRequestAllowed(config, "https://example.test/en", true),
    ).toBe(false);
    expect(
      isBenchmarkRequestAllowed(config, "http://127.0.0.1:3999/en", true),
    ).toBe(false);
    expect(
      isBenchmarkRequestAllowed(
        config,
        `${environment.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/user`,
        false,
      ),
    ).toBe(true);
    expect(
      isBenchmarkRequestAllowed(
        config,
        `${environment.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/user`,
        true,
      ),
    ).toBe(false);
  });

  it("requires healthy actual HTTP configuration and the expected served revision", () => {
    const revision = "a".repeat(40);
    expect(() =>
      assertBenchmarkHealth(
        {
          status: "ok",
          configuration: { ready: true, issues: [] },
          commit: revision,
        },
        revision,
      ),
    ).not.toThrow();
    expect(() =>
      assertBenchmarkHealth(
        {
          status: "degraded",
          configuration: { ready: false },
          commit: revision,
        },
        revision,
      ),
    ).toThrow();
    expect(() =>
      assertBenchmarkHealth(
        {
          status: "ok",
          configuration: { ready: true },
          commit: "b".repeat(40),
        },
        revision,
      ),
    ).toThrow();
  });
});

describe("measured action aggregation", () => {
  it("separates scripted decisions, navigation and simulated clock operations without inventing human savings", () => {
    const summary = summarizeBenchmarkActions([
      {
        name: "enter",
        actor: "operator",
        category: "setup",
        durationMs: 20,
        success: true,
      },
      {
        name: "search",
        actor: "guest",
        category: "interaction",
        durationMs: 31,
        success: true,
      },
      {
        name: "approve",
        actor: "host",
        category: "decision",
        durationMs: 70,
        success: true,
      },
      {
        name: "clock",
        actor: "operator",
        category: "demo_clock",
        durationMs: 10,
        success: true,
      },
      {
        name: "return",
        actor: "guest",
        category: "navigation",
        durationMs: 15,
        success: false,
      },
    ]);
    expect(summary).toMatchObject({
      attempted: 5,
      succeeded: 4,
      failed: 1,
      measuredActionDurationMs: 146,
    });
    expect(summary.byCategory).toEqual({
      setup: 1,
      navigation: 1,
      interaction: 1,
      decision: 1,
      demo_clock: 1,
    });
    expect(summary.simulatedDecisions).toEqual({ host: 1, guest: 0 });
    expect(summary).not.toHaveProperty("timeSaved");
  });

  it("rejects invalid timing evidence", () => {
    expect(() =>
      summarizeBenchmarkActions([
        {
          name: "bad",
          actor: "guest",
          category: "decision",
          durationMs: -1,
          success: true,
        },
      ]),
    ).toThrow();
  });
});
