import { expect, test } from "@playwright/test";

test("the sign-in page offers Google and no demo entry", async ({ page }) => {
  await page.goto("/en/sign-in");
  await expect(page.getByTestId("google-sign-in")).toBeVisible();
  await expect(page.locator('[data-testid^="demo-enter-"]')).toHaveCount(0);
});

test("a host error keeps the Google button beside it", async ({ page }) => {
  await page.goto("/es/sign-in?error=not_a_host");
  await expect(page.getByTestId("google-sign-in")).toBeVisible();
  await expect(page.locator(".postcard__error")).toHaveAttribute("role", "alert");
});

test("the retired demo routes are gone", async ({ request }) => {
  for (const path of [
    "/en/demo-enter",
    "/en/demo-enter-guest",
    "/api/demo/reset",
  ]) {
    const response = await request.post(path, { maxRedirects: 0 });
    expect(response.status(), path).toBe(404);
  }
});
