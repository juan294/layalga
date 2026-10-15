import {
  ASYNC_COMPLETION_TIMEOUT,
  clickAndWaitForPost,
  expectRunStatus,
} from "./helpers/async-actions";
import { expect } from "@playwright/test";

import { findFixtureGuest } from "../../src/test-support/fixture-household";
import { test } from "./helpers/household";

test.setTimeout(90_000);

test("@mobile guest link reaches a touch-safe host decision", async ({
  context,
  household,
  page,
}) => {
  await household.signIn(context);
  await page.goto(`/en/g/${findFixtureGuest(household, "The Parkers").token}`);
  await expect(page.getByTestId("guest-status")).toBeVisible();
  await expect(
    page.locator('form[data-webmcp-guest-search][data-hydrated="true"]'),
  ).toBeVisible();
  await clickAndWaitForPost(page, "find-options");
  await expect(page.getByTestId("guest-room-option").first()).toBeVisible();
  await expect(page.getByTestId("guest-room-option").first()).toBeChecked();
  await page.getByTestId("guest-option").first().check();
  await page.getByTestId("guest-submit").click();
  await expectRunStatus(page, "interrupted");

  await page.goto("/en");
  const approve = page.getByTestId("approve-decision");
  await expect(approve).toBeVisible();
  await expect(approve).toHaveCSS("min-height", "44px");
  await Promise.all([
    page.waitForURL(/\/en\/runs\/[0-9a-f-]+\/status/, { timeout: 30_000 }),
    approve.click(),
  ]);
  await expectRunStatus(page, "completed");
  await page.getByTestId("run-return").click();
  await expect(page.getByTestId("pending-decision")).toHaveCount(0);

  await page
    .getByTestId("host-capture-message")
    .fill(`Invite Ana and Luis for a weekend next month. ${household.tag}`);
  await clickAndWaitForPost(page, "host-capture-submit");
  await expect(page.getByTestId("capture-queued")).toBeVisible();
  await expect(page.getByTestId("structured-invitation")).toBeVisible({
    timeout: ASYNC_COMPLETION_TIMEOUT,
  });
  await expect(page.getByTestId("guest-link")).toBeVisible();
});
