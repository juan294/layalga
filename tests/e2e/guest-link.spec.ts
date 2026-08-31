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
  await page.getByTestId("find-options").click();
  await expect(page.getByTestId("guest-option")).toHaveCount(1);
  await page.getByTestId("guest-option").first().check();
  await expect(
    page.locator('[data-testid="guest-room-option"]:checked'),
  ).toHaveCount(2);
  await page.getByTestId("guest-submit").click();

  await expect(page).toHaveURL(/\/en\/runs\/[0-9a-f-]+\/status/);
  await expect(page.getByTestId("run-status")).toHaveAttribute(
    "data-status",
    /completed|interrupted/,
  );
  await page.getByTestId("run-return").click();
  await expect(page.getByTestId("guest-status")).toHaveAttribute(
    "data-status",
    /hold|confirmed/,
  );
  await expect(page.getByTestId("guest-room-count")).toBeVisible();
  await expect(page.getByTestId("guest-room-labels")).not.toHaveText(
    "Assignment pending",
  );
});

test("supports Spanish keyboard room selection and focuses fresh results", async ({
  page,
}) => {
  await page.goto(`/es/g/${vegaToken}`);
  await page.getByTestId("find-options").click();
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
