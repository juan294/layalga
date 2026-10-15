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
    exclude: [
      ...configDefaults.exclude,
      "dist/**",
      "tests/e2e/**",
      ".claude/worktrees/**",
    ],
  },
});
