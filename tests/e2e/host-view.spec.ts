import { expect, test } from "@playwright/test";

import { createDemoHostCookie } from "../../src/lib/auth/demo-session";

const oterosToken = "o".repeat(43);
const nelHostId = "00000000-0000-4000-8000-000000000201";

test.beforeEach(async ({ context, page }) => {
  await context.addCookies([
    {
      httpOnly: true,
      name: "layalga_demo_host",
      sameSite: "Lax",
      url: "http://127.0.0.1:3008",
      value: createDemoHostCookie(nelHostId),
    },
  ]);
  await page.goto("/en");
  await expect(page.getByTestId("host-capture-form")).toBeVisible();
});

test("captures an invitation and exposes its private guest link", async ({
  page,
}) => {
  await page
    .getByTestId("host-capture-message")
    .fill(
      "Oye, los Vega quieren venir a la casa un finde de septiembre, son Marta y Xuan con los dos crios.",
    );
  await page.getByTestId("host-capture-submit").click();

  await expect(page.getByTestId("structured-invitation")).toBeVisible();
  await expect(page.getByTestId("guest-link")).toHaveAttribute(
    "href",
    /\/g\/[A-Za-z0-9_-]{43}$/,
  );
});

test("a special request waits for a host and resumes after approval", async ({
  page,
}) => {
  await page.goto(`/en/g/${oterosToken}`);
  await page.getByTestId("find-options").click();
  await page.getByTestId("guest-option").first().check();
  await page.getByTestId("guest-submit").click();
  await expect(page.getByTestId("run-status")).toHaveAttribute(
    "data-status",
    "interrupted",
  );

  await page.goto("/en");
  await expect(page.getByTestId("pending-decision")).toBeVisible();
  await page.getByTestId("approve-decision").click();
  await expect(page.getByTestId("pending-decision")).toHaveCount(0);
});

test("switches the host view to Spanish", async ({ page }) => {
  const heading = page.getByRole("heading", { level: 1 });
  const englishHeading = await heading.textContent();

  await page.getByTestId("locale-switch-es").click();

  await expect(page).toHaveURL(/\/es(?:\/|$)/);
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(
    englishHeading ?? "",
  );
});
