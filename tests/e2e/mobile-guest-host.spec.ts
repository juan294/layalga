import { expect, test } from "@playwright/test";

import { seedDemo } from "../../scripts/seed-demo";
import { createDemoHostCookie } from "../../src/lib/auth/demo-session";

const oterosToken = "o".repeat(43);
const nelHostId = "00000000-0000-4000-8000-000000000201";
test.setTimeout(90_000);

test("@mobile guest link reaches a touch-safe host decision", async ({
  context,
  page,
}) => {
  const databaseUrl = process.env.DATABASE_URL;
  const tokenSecret = process.env.LINK_TOKEN_SECRET;
  if (!databaseUrl || !tokenSecret)
    throw new Error("E2E database settings are missing");
  await seedDemo(databaseUrl, tokenSecret);

  await context.addCookies([
    {
      httpOnly: true,
      name: "layalga_demo_host",
      sameSite: "Lax",
      url: "http://127.0.0.1:3008",
      value: createDemoHostCookie(nelHostId),
    },
  ]);
  await page.goto(`/en/g/${oterosToken}`);
  await expect(page.getByTestId("guest-status")).toBeVisible();
  await expect(
    page.locator('form[data-webmcp-guest-search][data-hydrated="true"]'),
  ).toBeVisible();
  await page.getByTestId("find-options").click();
  await expect(page.getByTestId("guest-room-option").first()).toBeVisible();
  await expect(page.getByTestId("guest-room-option").first()).toBeChecked();
  await page.getByTestId("guest-option").first().check();
  await page.getByTestId("guest-submit").click();
  await expect(page.getByTestId("run-status")).toHaveAttribute(
    "data-status",
    "interrupted",
  );

  await page.goto("/en");
  const approve = page.getByTestId("approve-decision");
  await expect(approve).toBeVisible();
  await expect(approve).toHaveCSS("min-height", "44px");
  await Promise.all([
    page.waitForURL(/\/en\/runs\/[0-9a-f-]+\/status/, { timeout: 30_000 }),
    approve.click(),
  ]);
  await expect(page.getByTestId("run-status")).toHaveAttribute(
    "data-status",
    "completed",
  );
  await page.getByTestId("run-return").click();
  await expect(page.getByTestId("pending-decision")).toHaveCount(0);

  await page
    .getByTestId("host-capture-message")
    .fill("Invite Ana and Luis for the first weekend in October.");
  await page.getByTestId("host-capture-submit").click();
  await expect(page.getByTestId("capture-queued")).toBeVisible();
  await page.getByTestId("capture-reveal").click();
  await expect(page.getByTestId("structured-invitation")).toBeVisible();
  await expect(page.getByTestId("guest-link")).toBeVisible();
});
