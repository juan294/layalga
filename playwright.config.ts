import { defineConfig, devices } from "@playwright/test";

const e2eBaseUrl = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3008";
const e2ePort = new URL(e2eBaseUrl).port || "80";
const e2eEnv = {
  DATABASE_URL:
    process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:54622/postgres",
  LINK_TOKEN_SECRET:
    process.env.LINK_TOKEN_SECRET ?? "0123456789abcdef0123456789abcdef",
  DEMO_SESSION_SECRET:
    process.env.DEMO_SESSION_SECRET ?? "abcdef0123456789abcdef0123456789",
  TICK_SECRET: process.env.TICK_SECRET ?? "fedcba9876543210fedcba9876543210",
  AGENT_ROUTE_SECRET:
    process.env.AGENT_ROUTE_SECRET ?? "agent-route-0123456789abcdef0123456789",
  CALENDAR_FEED_SECRET:
    process.env.CALENDAR_FEED_SECRET ?? "calendar-0123456789abcdef012345678901",
  NEXT_PUBLIC_SUPABASE_URL:
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54621",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH",
  APP_URL: process.env.APP_URL ?? e2eBaseUrl,
  DEMO_MODE: "true",
  AGENT_RUNTIME: "local",
  MODEL: "scripted",
  SCHEDULER: "none",
};
Object.assign(process.env, e2eEnv);

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  workers: 1,
  use: {
    baseURL: e2eBaseUrl,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      grepInvert: /@mobile/,
    },
    {
      name: "mobile-webkit",
      use: { ...devices["iPhone 13"] },
      grep: /@mobile/,
    },
  ],
  webServer: {
    command: `./node_modules/.bin/next dev --webpack --port ${e2ePort}`,
    env: e2eEnv,
    url: e2eBaseUrl,
    reuseExistingServer: false,
  },
});
