import { clickAndWaitForPost, expectRunStatus } from "./helpers/async-actions";
import { expect, test } from "@playwright/test";

import { seedDemo } from "../../scripts/seed-demo";

const vegaToken = "v".repeat(43);
test.setTimeout(90_000);

test.beforeEach(async () => {
  const databaseUrl = process.env.DATABASE_URL;
  const tokenSecret = process.env.LINK_TOKEN_SECRET;
  if (!databaseUrl || !tokenSecret)
    throw new Error("E2E database settings are missing");
  await seedDemo(databaseUrl, tokenSecret);
});

test("a guest chooses an offered stay and places a hold", async ({ page }) => {
  await page.goto(`/en/g/${vegaToken}`);

  await expect(page.getByTestId("guest-status")).toHaveAttribute(
    "data-status",
    "invited",
  );
  await expect(
    page.locator('form[data-webmcp-guest-search][data-hydrated="true"]'),
  ).toBeVisible();
  await clickAndWaitForPost(page, "find-options");
  await expect(page.getByTestId("guest-option")).toHaveCount(1);
  await page.getByTestId("guest-option").first().check();
  await expect(
    page.locator('[data-testid="guest-room-option"]:checked'),
  ).toHaveCount(2);
  await page
    .locator('textarea[name="notes"]')
    .fill("Thanks! We will arrive after lunch.");
  await page.getByTestId("guest-submit").click();

  await expect(page).toHaveURL(/\/en\/runs\/[0-9a-f-]+\/status/);
  await expectRunStatus(page, "completed");
  await page.getByTestId("run-return").click();
  await expect(page.getByTestId("guest-status")).toHaveAttribute(
    "data-status",
    "confirmed",
  );
  await expect(page.getByTestId("guest-room-count")).toBeVisible();
  await expect(page.getByTestId("guest-room-labels")).not.toHaveText(
    "Assignment pending",
  );
  await expect(
    page.getByText("Thanks! We will arrive after lunch.", { exact: true }),
  ).toBeVisible();
  await page.locator("#cancel-request summary").click();
  const review = page.locator("#cancel-request");
  await expect(review.locator('[name="expectedVisitId"]')).not.toHaveValue("");
  await review.locator('[name="confirmed"]').check();
  await review.getByTestId("confirm-cancellation").click();
  await expect(page).toHaveURL(/\/en\/cancellation-complete$/);
  // The original bearer access is revoked by the completed cancellation.
  await page.goto(`/en/g/${vegaToken}`);
  await expect(
    page.getByRole("heading", {
      name: "This invitation link is not available",
    }),
  ).toBeVisible();
});

test("supports Spanish keyboard room selection and focuses fresh results", async ({
  page,
}) => {
  await page.goto(`/es/g/${vegaToken}`);
  await expect(
    page.locator('form[data-webmcp-guest-search][data-hydrated="true"]'),
  ).toBeVisible();
  await clickAndWaitForPost(page, "find-options");
  await expect(
    page.getByRole("heading", { name: "Elige tus habitaciones exactas" }),
  ).toBeFocused();
  const firstRoom = page.getByTestId("guest-room-option").first();
  await firstRoom.focus();
  const initiallyChecked = await firstRoom.isChecked();
  await page.keyboard.press("Space");
  await expect(firstRoom).toBeChecked({ checked: !initiallyChecked });
  await page.keyboard.press("Space");
  await expect(firstRoom).toBeChecked({ checked: initiallyChecked });
  await expect(page.getByText(/Capacidad elegida/)).toBeVisible();
});

test("an invited guest can withdraw before choosing a stay", async ({
  page,
}) => {
  await page.goto(`/en/g/${vegaToken}`);
  await page.locator("#cancel-request summary").click();
  const review = page.locator("#cancel-request");
  await expect(review.locator('[name="expectedVisitId"]')).toHaveValue("");
  await review.locator('[name="confirmed"]').check();
  await review.getByTestId("confirm-cancellation").click();
  await expect(page).toHaveURL(/\/en\/cancellation-complete$/);
});
