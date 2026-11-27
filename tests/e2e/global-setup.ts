import type { FullConfig } from "@playwright/test";

import { REDIRECT_TARGETS } from "../../src/test-support/redirect-targets";

/**
 * Compiles every redirect target once before the first test (see
 * `src/test-support/redirect-targets.ts`). Playwright starts the web server
 * before this setup, and `next.config.ts` keeps the compiled pages for the
 * run while `E2E_KEEP_COMPILED_PAGES` is set.
 */
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL;
  if (!baseURL) throw new Error("Global setup needs a baseURL.");
  for (const { path } of REDIRECT_TARGETS) {
    const response = await fetch(new URL(path, baseURL), {
      redirect: "manual",
      signal: AbortSignal.timeout(120_000),
    });
    await response.arrayBuffer();
    if (response.status >= 500)
      throw new Error(`Warming ${path} answered ${response.status}.`);
  }
}
