# Phase 5 — End-to-end verification

Depends on phase 4.

## Files

- `tests/e2e/guest-demo-session.spec.ts` (new)
- `scripts/demo-e2e.ts` (check only; edit if a dependency on Jordan Lynn's
  host id is found)

## Step 1 — Verify the demo driver doesn't depend on the dropped host

`grep -n "000000000202\|Jordan" scripts/demo-e2e.ts`. Per research, the demo
driver's `enterHost()` (`scripts/demo-e2e.ts:360-374`) POSTs directly to
`/demo-enter` with a `hostId` it already has — check which host id it uses.
If it uses Juan González's id (`...0201`), no change needed. If it uses
Jordan Lynn's id or iterates both demo hosts, adjust it to use only Juan's id
here, since Jordan no longer has a sign-in path once phase 4 lands (his host
row still exists in the DB per the seed, but the demo driver is exercising a
user-facing flow, not raw seed data).

## Step 2 — New e2e spec

Follow the existing pattern in `tests/e2e/host-view.spec.ts` (cookie
injection via `createDemoHostCookie`/`createDemoGuestCookie` for
already-authenticated assertions, real navigation + clicks for the sign-in
flow itself since that's the thing under test):

```ts
import { expect, test } from "@playwright/test";
import { seedDemo } from "..."; // match existing helper import
import { createDemoGuestCookie } from "@/lib/auth/demo-session";

test.describe("demo sign-in", () => {
  test("renders exactly two demo buttons and no Google button", async ({ page }) => {
    await seedDemo(databaseUrl, tokenSecret);
    await page.goto("/en/sign-in");
    await expect(page.getByTestId("demo-enter-host")).toBeVisible();
    await expect(page.getByTestId("demo-enter-guest")).toBeVisible();
    await expect(page.getByText("Continue with Google")).toHaveCount(0);
  });

  test("Enter as Host lands on the host capture form", async ({ page }) => {
    await page.goto("/en/sign-in");
    await page.getByTestId("demo-enter-host").click();
    await expect(page.getByTestId("host-capture-form")).toBeVisible();
  });

  test("Enter as Guest lands on The Oteros' invitation", async ({ page }) => {
    await page.goto("/en/sign-in");
    await page.getByTestId("demo-enter-guest").click();
    await expect(page).toHaveURL(/\/en\/guest$/);
    await expect(page.getByTestId("guest-status")).toBeVisible();
  });

  test("a guest-cookie session can search and submit a stay", async ({ page, context }) => {
    // seed already has invitation ...402 (The Oteros) in "invited" status
    await context.addCookies([{
      httpOnly: true,
      name: "layalga_demo_guest",
      sameSite: "Lax",
      url: "http://127.0.0.1:3008",
      value: createDemoGuestCookie("00000000-0000-4000-8000-000000000402"),
    }]);
    await page.goto("/en/guest");
    await page.getByTestId("find-options").click();
    await expect(page.getByTestId("guest-option").first()).toBeVisible();
    // select a room, submit, confirm redirect to run-status with no ?token=
    await page.getByTestId("guest-room-option").first().check();
    await page.getByTestId("guest-submit").click();
    await expect(page).toHaveURL(/\/en\/runs\/.+\/status\?returnTo=/);
    await expect(page.url()).not.toContain("token=");
  });
});
```

Adjust selectors/helpers to match whatever `seedDemo`/database-url wiring
`host-view.spec.ts` actually uses (read that file's imports before writing
this one, since the exact helper names weren't captured in this plan's
research pass).

## Step 3 — Full verification suite

Run in order, per CLAUDE.md and this project's sequential-verification rule
(never parallel):

```
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run build
pnpm run test:e2e
pnpm run demo:e2e
pnpm run release:probes
bash scripts/verify-bootstrap.sh
```

## Automated success criteria

- All commands above exit 0.
- The new e2e spec passes, including the token-free run-status assertion.

## Manual success criteria

- Full click-through in a real browser (not just Playwright): sign in as
  guest, search, submit, watch the run-status page resolve, land back on
  `/en/guest`, then exercise "request a change" and (once a visit exists)
  "reconfirm" from the guest cookie session.
- Confirm the guest-claim Google button (`/en/g/<token>` page) and the
  `/visits` sign-in button are still visible — they are explicitly out of
  scope and must not have been accidentally hidden by the `DEMO_MODE` gate
  added in phase 4 (that gate only wraps the sign-in page's button).
