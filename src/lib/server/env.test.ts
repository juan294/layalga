import { describe, expect, it } from "vitest";

import { parseServerEnvironment, serverEnvironmentReadiness } from "./env";

describe("server environment", () => {
  it("keeps local scripted development usable without cloud secrets", () => {
    expect(parseServerEnvironment({ NODE_ENV: "development" })).toMatchObject({
      agentRuntime: "local",
      model: "scripted",
      scheduler: "none",
      appUrl: "http://localhost:3008",
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
});
