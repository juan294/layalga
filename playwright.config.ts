import { defineConfig, devices } from "@playwright/test";

const e2eEnv = {
  DATABASE_URL:
    process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:54622/postgres",
  LINK_TOKEN_SECRET:
    process.env.LINK_TOKEN_SECRET ?? "0123456789abcdef0123456789abcdef",
  DEMO_SESSION_SECRET:
    process.env.DEMO_SESSION_SECRET ?? "abcdef0123456789abcdef0123456789",
  TICK_SECRET: process.env.TICK_SECRET ?? "fedcba9876543210fedcba9876543210",
  APP_URL: process.env.APP_URL ?? "http://127.0.0.1:3000",
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
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "pnpm run dev",
    env: e2eEnv,
    url: "http://127.0.0.1:3000",
    reuseExistingServer: false,
  },
});
