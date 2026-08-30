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
        branches: 25,
        functions: 30,
        lines: 30,
        statements: 30,
      },
    },
    environment: "node",
    exclude: [...configDefaults.exclude, "dist/**", "tests/e2e/**"],
  },
});
