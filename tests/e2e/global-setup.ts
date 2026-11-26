import type { FullConfig } from "@playwright/test";

/**
 * Pages that tests reach through a server action redirect and then wait for
 * with a 5 s `toHaveURL`. On a cold `next dev`, the action's response
 * includes the first compile of its target, which took 3.3 s for the run
 * status page with no load and more than 5 s on a busy runner (CI runs
 * 45584306035, 45648368310, 45782951693 and 45873076064). Playwright starts
 * the web server before this setup, so one request per page compiles it
 * before the first test. The answers do not matter: a page without a session
 * or a known id still compiles.
 */
export const REDIRECT_TARGETS = [
  "/en/runs/00000000-0000-4000-8000-000000000000/status",
  "/en/cancellation-complete",
  "/en/guest/email-status",
  "/en/sign-in",
  "/en/assistants",
  "/en/rooms",
] as const;

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL;
  if (!baseURL) throw new Error("Global setup needs a baseURL.");
  for (const path of REDIRECT_TARGETS) {
    const response = await fetch(new URL(path, baseURL), {
      redirect: "manual",
      signal: AbortSignal.timeout(120_000),
    });
    await response.arrayBuffer();
    if (response.status >= 500)
      throw new Error(`Warming ${path} answered ${response.status}.`);
  }
}
