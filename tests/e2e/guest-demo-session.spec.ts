import { expect, test } from "@playwright/test";

import { DEMO_SEED, seedDemo } from "../../scripts/seed-demo";
import {
  createDemoGuestCookie,
  DEMO_GUEST_COOKIE,
} from "../../src/lib/auth/demo-session";

const baseUrl = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3008";

test.describe("demo guest session", () => {
  test.describe.configure({ timeout: 90_000 });

  test.beforeEach(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    const tokenSecret = process.env.LINK_TOKEN_SECRET;
    if (!databaseUrl || !tokenSecret) {
      throw new Error("E2E database settings are missing");
    }
    await seedDemo(databaseUrl, tokenSecret);
  });

  test("renders exactly two demo buttons and no Google button", async ({
    page,
  }) => {
    await page.goto("/en/sign-in");

    await expect(page.locator('[data-testid^="demo-enter-"]')).toHaveCount(2);
    await expect(page.getByTestId("demo-enter-host")).toHaveText(
      "Enter as Host",
    );
    await expect(page.getByTestId("demo-enter-host")).not.toContainText(
      DEMO_SEED.hosts[0].displayName,
    );
    await expect(page.getByTestId("demo-enter-guest")).toBeVisible();
    await expect(page.getByText("Continue with Google")).toHaveCount(0);
  });

  test("enters the host capture flow from sign-in", async ({ page }) => {
    await page.goto("/en/sign-in");
    await page.getByTestId("demo-enter-host").click();

    await expect(page.getByTestId("host-capture-form")).toBeVisible();
  });

  test(`enters ${DEMO_SEED.parties[1].familyName} guest invitation from sign-in`, async ({
    page,
  }) => {
    await page.goto("/en/sign-in");
    await page.getByTestId("demo-enter-guest").click();

    await expect(page).toHaveURL(/\/en\/guest$/);
    await expect(page.getByTestId("guest-status")).toHaveAttribute(
      "data-status",
      "invited",
    );
    await expect(page.getByTestId("guest-status")).toContainText(
      DEMO_SEED.parties[1].familyName,
    );
  });

  test("searches and submits a stay with guest-cookie authorization", async ({
    context,
    page,
  }) => {
    await context.addCookies([
      {
        httpOnly: true,
        name: DEMO_GUEST_COOKIE,
        sameSite: "Lax",
        url: baseUrl,
        value: createDemoGuestCookie(DEMO_SEED.parties[1].invitation.id),
      },
    ]);
    await page.goto("/en/guest");
    await expect(page.getByTestId("guest-status")).toHaveAttribute(
      "data-status",
      "invited",
    );
    await expect(
      page.locator('form[data-webmcp-guest-search][data-hydrated="true"]'),
    ).toBeVisible();

    await page.getByTestId("find-options").click();
    await expect(page.getByTestId("guest-option").first()).toBeVisible();
    await expect(page.getByTestId("guest-room-option").first()).toBeChecked();
    await page.getByTestId("guest-option").first().check();
    await page.getByTestId("guest-submit").click();

    await expect(page).toHaveURL(/\/en\/runs\/[0-9a-f-]+\/status\?returnTo=/, {
      timeout: 30_000,
    });
    await expect(page.getByTestId("run-status")).toHaveAttribute(
      "data-status",
      "interrupted",
    );
    await expect(page.getByTestId("run-status")).toContainText(
      "Waiting for a host",
    );
    await expect(page.getByTestId("run-status")).toContainText(
      "A host decision is needed before this update can continue.",
    );
    const statusUrl = new URL(page.url());
    expect(statusUrl.searchParams.get("returnTo")).toBe("/en/guest");
    expect(statusUrl.searchParams.has("token")).toBe(false);
  });
});
