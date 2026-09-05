import { expect, type Page } from "@playwright/test";

export const ASYNC_COMPLETION_TIMEOUT = 30_000;

/** Wait for the server action before asserting the resulting UI. */
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
  expect(await response.finished()).toBeNull();
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
