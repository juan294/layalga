import { expect, type Page } from "@playwright/test";

export const ASYNC_COMPLETION_TIMEOUT = 30_000;
const STREAM_SETTLE_TIMEOUT = 5_000;

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
  // Server-action responses stream (RSC). Under `next dev` the client applies
  // the action result as soon as its chunk arrives and the UI moves on, but
  // Chromium intermittently never reports the stream as finished (CI run
  // 39758320414: the dev server logged the POST as complete in ~100ms while
  // `response.finished()` hung for the whole 90s test timeout). The UI
  // assertions that follow every call are the completion proof; only a
  // transport error reported promptly by the stream should fail here.
  const finished = await Promise.race([
    response.finished(),
    new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), STREAM_SETTLE_TIMEOUT),
    ),
  ]);
  expect(finished).toBeNull();
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
