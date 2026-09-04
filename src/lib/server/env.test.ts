import { describe, expect, it } from "vitest";

import { parseServerEnvironment, serverEnvironmentReadiness } from "./env";

describe("server environment", () => {
  it("keeps local scripted development usable without cloud secrets", () => {
    expect(parseServerEnvironment({ NODE_ENV: "development" })).toMatchObject({
      agentRuntime: "local",
      model: "scripted",
      scheduler: "none",
      email: "none",
      appUrl: "http://localhost:3008",
    });
  });

  it("keeps health ok with EMAIL=none", () => {
    const readiness = serverEnvironmentReadiness({ NODE_ENV: "development" });
    expect(readiness.ready).toBe(true);
    expect(readiness.issues).not.toContainEqual(
      expect.objectContaining({ key: "SES_FROM_ADDRESS" }),
    );
  });

  it("requires SES_FROM_ADDRESS when EMAIL=ses", () => {
    const readiness = serverEnvironmentReadiness({
      NODE_ENV: "development",
      EMAIL: "ses",
    });
    expect(readiness.ready).toBe(false);
    expect(readiness.issues).toContainEqual({
      key: "SES_FROM_ADDRESS",
      code: "missing",
    });
  });

  it("accepts EMAIL=ses once SES_FROM_ADDRESS and a region are present", () => {
    expect(
      parseServerEnvironment({
        NODE_ENV: "development",
        EMAIL: "ses",
        SES_FROM_ADDRESS: "noreply@layalga.example",
        AWS_REGION: "us-east-1",
      }),
    ).toMatchObject({
      email: "ses",
      sesFromAddress: "noreply@layalga.example",
    });
  });

  it("keeps MEMORY=none by default", () => {
    expect(parseServerEnvironment({ NODE_ENV: "development" })).toMatchObject({
      memory: "none",
      memoryId: undefined,
    });
    const readiness = serverEnvironmentReadiness({ NODE_ENV: "development" });
    expect(readiness.ready).toBe(true);
    expect(readiness.issues).not.toContainEqual(
      expect.objectContaining({ key: "MEMORY_ID" }),
    );
  });

  it("requires MEMORY_ID and AWS_REGION when MEMORY=agentcore", () => {
    expect(() =>
      parseServerEnvironment({ NODE_ENV: "development", MEMORY: "agentcore" }),
    ).toThrow(/AWS_REGION/);
    expect(() =>
      parseServerEnvironment({
        NODE_ENV: "development",
        MEMORY: "agentcore",
        AWS_REGION: "us-east-1",
      }),
    ).toThrow(/MEMORY_ID/);
    const readiness = serverEnvironmentReadiness({
      NODE_ENV: "development",
      MEMORY: "agentcore",
    });
    expect(readiness.ready).toBe(false);
    expect(readiness.issues).toContainEqual({
      key: "MEMORY_ID",
      code: "missing",
    });
    expect(readiness.issues).toContainEqual({
      key: "AWS_REGION",
      code: "missing",
    });
  });

  it("accepts MEMORY=agentcore once MEMORY_ID and AWS_REGION are present", () => {
    expect(
      parseServerEnvironment({
        NODE_ENV: "development",
        MEMORY: "agentcore",
        MEMORY_ID: "LayalgaHouseholdMemory-CBgKZc7mK4",
        AWS_REGION: "us-east-1",
      }),
    ).toMatchObject({
      memory: "agentcore",
      memoryId: "LayalgaHouseholdMemory-CBgKZc7mK4",
    });
  });

  it("rejects ambiguous production modes without exposing values", () => {
    const readiness = serverEnvironmentReadiness({
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      AGENT_RUNTIME: "sometimes",
      MODEL: "maybe",
      SCHEDULER: "later",
      APP_URL: "postgresql://user:password@example.test/private",
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.issues.map(({ key }) => key)).toEqual(
      expect.arrayContaining([
        "AGENT_RUNTIME",
        "MODEL",
        "SCHEDULER",
        "APP_URL",
      ]),
    );
    expect(JSON.stringify(readiness)).not.toContain("password");
    expect(JSON.stringify(readiness)).not.toContain("sometimes");
  });

  it("requires only the secrets used by the selected production modes", () => {
    const readiness = serverEnvironmentReadiness({
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      AGENT_RUNTIME: "local",
      MODEL: "scripted",
      SCHEDULER: "none",
      APP_URL: "https://layalga.example",
      DATABASE_URL: "postgresql://database.example/postgres",
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable",
      LINK_TOKEN_SECRET: "l".repeat(32),
      CALENDAR_FEED_SECRET: "f".repeat(32),
      AGENT_ROUTE_SECRET: "a".repeat(32),
      CRON_SECRET: "c".repeat(32),
    });

    expect(readiness).toEqual({ ready: true, issues: [] });
  });

  it("requires AgentCore and scheduler fields only when selected", () => {
    const readiness = serverEnvironmentReadiness({
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      AGENT_RUNTIME: "agentcore",
      MODEL: "bedrock",
      SCHEDULER: "eventbridge",
      APP_URL: "https://layalga.example",
      DATABASE_URL: "postgresql://database.example/postgres",
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable",
      LINK_TOKEN_SECRET: "l".repeat(32),
      CALENDAR_FEED_SECRET: "f".repeat(32),
      AGENT_ROUTE_SECRET: "a".repeat(32),
      CRON_SECRET: "c".repeat(32),
    });

    expect(readiness.issues.map(({ key }) => key)).toEqual(
      expect.arrayContaining([
        "AGENTCORE_RUNTIME_ARN",
        "BEDROCK_MODEL_ID",
        "AWS_REGION",
        "SCHEDULER_ROLE_ARN",
        "SCHEDULER_DLQ_ARN",
      ]),
    );
  });

  it("requires a purpose-specific production calendar feed secret", () => {
    const readiness = serverEnvironmentReadiness({
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      AGENT_RUNTIME: "local",
      MODEL: "scripted",
      SCHEDULER: "none",
      APP_URL: "https://layalga.example",
      DATABASE_URL: "postgresql://database.example/postgres",
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable",
      LINK_TOKEN_SECRET: "l".repeat(32),
      AGENT_ROUTE_SECRET: "a".repeat(32),
      CRON_SECRET: "c".repeat(32),
    });

    expect(readiness.issues).toContainEqual({
      key: "CALENDAR_FEED_SECRET",
      code: "missing",
    });
  });

  describe("agent-process profile", () => {
    function agentProfileEnv(
      overrides: Record<string, string | undefined> = {},
    ) {
      return {
        NODE_ENV: "production" as const,
        AGENT_EXECUTION_RUNTIME: "agentcore",
        DATABASE_URL: "postgresql://database.example/postgres",
        APP_URL: "https://layalga.example",
        LINK_TOKEN_SECRET: "l".repeat(32),
        MODEL: "bedrock",
        BEDROCK_MODEL_ID: "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
        AWS_REGION: "us-east-1",
        ...overrides,
      };
    }

    it("validates the AgentCore process against a narrower production contract", () => {
      expect(parseServerEnvironment(agentProfileEnv())).toMatchObject({
        agentProcess: true,
        agentRuntime: "local",
        scheduler: "none",
      });
    });

    it("keeps requiring AGENT_RUNTIME for the web app when the flag is absent", () => {
      expect(() =>
        parseServerEnvironment(
          agentProfileEnv({ AGENT_EXECUTION_RUNTIME: undefined }),
        ),
      ).toThrow(/AGENT_RUNTIME/);
    });

    it("rejects an unrecognized AGENT_EXECUTION_RUNTIME value", () => {
      expect(() =>
        parseServerEnvironment(
          agentProfileEnv({ AGENT_EXECUTION_RUNTIME: "bogus" }),
        ),
      ).toThrow(/AGENT_EXECUTION_RUNTIME/);
    });

    it("still requires LINK_TOKEN_SECRET and an https APP_URL for the agent process", () => {
      expect(() =>
        parseServerEnvironment(
          agentProfileEnv({ LINK_TOKEN_SECRET: undefined }),
        ),
      ).toThrow(/LINK_TOKEN_SECRET/);
      expect(() =>
        parseServerEnvironment(
          agentProfileEnv({ APP_URL: "http://layalga.example" }),
        ),
      ).toThrow(/APP_URL/);
    });

    it("mirrors the agent-process profile in readiness checks", () => {
      expect(serverEnvironmentReadiness(agentProfileEnv())).toEqual({
        ready: true,
        issues: [],
      });
    });
  });
});
