import type { TestInfo } from "@playwright/test";

/**
 * Where a review screenshot is saved. CI uploads `test-results/` whenever a
 * file is there, so it keeps these in memory and the folder holds only the
 * traces of failed attempts.
 */
export function evidencePath(
  testInfo: TestInfo,
  name: string,
): string | undefined {
  return process.env.CI ? undefined : testInfo.outputPath(name);
}
