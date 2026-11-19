import { fileURLToPath } from "node:url";

import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    coverage: {
      thresholds: {
        branches: 50,
        functions: 55,
        lines: 53,
        statements: 52,
      },
    },
    environment: "node",
    // Synthetic settings so database-backed tests run with only DATABASE_URL,
    // as the CI integration job does. A value already in the environment wins.
    env: {
      APP_URL: process.env.APP_URL ?? "http://127.0.0.1:3008",
      LINK_TOKEN_SECRET:
        process.env.LINK_TOKEN_SECRET ?? "0123456789abcdef0123456789abcdef",
    },
    exclude: [
      ...configDefaults.exclude,
      "dist/**",
      "tests/e2e/**",
      ".claude/worktrees/**",
    ],
  },
});
