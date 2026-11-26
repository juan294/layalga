import { clickAndWaitForPost, expectRunStatus } from "./helpers/async-actions";
import { expect } from "@playwright/test";

import { findFixtureGuest } from "../../src/test-support/fixture-household";
import { test } from "./helpers/household";
import { expectTouchSafe } from "./helpers/touch-targets";

test.setTimeout(120_000);

test("@mobile every surface stays touch-safe at 390px", async ({
  context,
  household,
  page,
}) => {
  await household.signIn(context);

  await page.goto(`/en/g/${findFixtureGuest(household, "The Parkers").token}`);
  await expect(page.getByTestId("guest-status")).toBeVisible();
  await expectTouchSafe(page, "guest ledger");

  // Submitting leaves a pending decision, which is what makes the host
  // dashboard render its decision controls and the run status page reachable.
  await expect(
    page.locator('form[data-webmcp-guest-search][data-hydrated="true"]'),
  ).toBeVisible();
  await clickAndWaitForPost(page, "find-options");
  await expect(page.getByTestId("guest-room-option").first()).toBeVisible();
  await page.getByTestId("guest-option").first().check();
  await page.getByTestId("guest-submit").click();
  await expectRunStatus(page, "interrupted");

  await page.goto("/en");
  const approve = page.getByTestId("approve-decision");
  await expect(approve).toBeVisible();
  await page.getByLabel("Invited party").selectOption("returning");
  await expect(page.locator("#capture-party")).toBeVisible();
  await expectTouchSafe(page, "host dashboard");

  await Promise.all([
    page.waitForURL(/\/en\/runs\/[0-9a-f-]+\/status/, { timeout: 30_000 }),
    approve.click(),
  ]);
  await expect(page.getByTestId("run-status")).toBeVisible();
  await expectTouchSafe(page, "run status");
  await expectRunStatus(page, "completed");
});

test("@mobile the account chip stays inside the header with a very long email", async ({
  context,
  household,
  page,
}) => {
  const { userId } = await household.signIn(context);
  const email = `${"a".repeat(60 - "@fixture.test".length)}@fixture.test`;
  expect(email).toHaveLength(60);
  await household.db`update auth.users set email = ${email} where id = ${userId}`;

  await page.goto("/en");
  const chip = page.getByTestId("account-chip");
  await expect(chip).toContainText("aaaa");

  const layout = await page.evaluate(() => {
    const root = document.documentElement;
    const header = document
      .querySelector(".site-header")!
      .getBoundingClientRect();
    const chipBox = document
      .querySelector('[data-testid="account-chip"]')!
      .getBoundingClientRect();
    return {
      scrollWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
      header: { left: header.left, right: header.right, bottom: header.bottom },
      chip: {
        left: chipBox.left,
        right: chipBox.right,
        bottom: chipBox.bottom,
      },
    };
  });

  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
  expect(layout.chip.left).toBeGreaterThanOrEqual(layout.header.left);
  expect(layout.chip.right).toBeLessThanOrEqual(layout.header.right);
  expect(layout.chip.bottom).toBeLessThanOrEqual(layout.header.bottom);
  await expect(chip).toHaveAttribute("title", email);
});
