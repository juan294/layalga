import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  prettier,
  {
    // The design-sync shims stand in for server actions and next/navigation so
    // previews can render statically. Their parameters exist to satisfy the
    // real signatures, never to be read, and are underscore-prefixed to say so.
    files: [".design-sync/shims/**"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  globalIgnores([
    ".claude/worktrees/**",
    ".ds-sync/**",
    ".next/**",
    "coverage/**",
    "dist/**",
    "ds-bundle/**",
    "node_modules/**",
    "out/**",
    "playwright-report/**",
    "spike/**",
    "test-results/**",
  ]),
]);
