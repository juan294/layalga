import { expect, test } from "@playwright/test";

const vegaToken = "v".repeat(43);

test("a guest chooses an offered stay and places a hold", async ({ page }) => {
  await page.goto(`/en/g/${vegaToken}`);

  await expect(page.getByTestId("guest-status")).toHaveAttribute(
    "data-status",
    "invited",
  );
  await page.getByTestId("find-options").click();
  await expect(page.getByTestId("guest-option")).toHaveCount(1);
  await page.getByTestId("guest-option").first().check();
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
});
