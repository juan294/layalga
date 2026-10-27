import { expect, type Page } from "@playwright/test";

export const ASYNC_COMPLETION_TIMEOUT = 30_000;

/**
 * Correlate the action POST and reject HTTP errors. Callers then await the
 * visible result or exact run status: a streamed RSC response can stay open
 * after the action has completed, so transport EOF is not a completion signal.
 */
export async function clickAndWaitForPost(page: Page, testId: string) {
  const current = new URL(page.url());
  const completed = page.waitForResponse(
    (response) => {
      const target = new URL(response.url());
      return (
        target.origin === current.origin &&
        target.pathname === current.pathname &&
        response.request().method() === "POST"
      );
    },
    { timeout: ASYNC_COMPLETION_TIMEOUT },
  );
  await page.getByTestId(testId).click();
  const response = await completed;
  expect(response.status()).toBeLessThan(400);
}

/** Queued work is polled with backoff; require the exact terminal outcome. */
export async function expectRunStatus(
  page: Page,
  status: "completed" | "interrupted",
) {
  await expect(page.getByTestId("run-status")).toHaveAttribute(
    "data-status",
    status,
    { timeout: ASYNC_COMPLETION_TIMEOUT },
  );
}
