import { expect, test, type Page } from "@playwright/test";

import { seedDemo } from "../../scripts/seed-demo";

test.setTimeout(150_000);

async function searchAndSubmit(page: Page, exception: boolean) {
  await expect(
    page.locator('form[data-webmcp-guest-search][data-hydrated="true"]'),
  ).toBeVisible();
  await page.getByTestId("find-options").click();
  await expect(page.getByTestId("guest-submit-form")).toBeVisible();
  if (exception) {
    for (const checkbox of await page.getByTestId("guest-room-option").all()) {
      await checkbox.uncheck();
    }
    await page
      .locator('[name="roomIds"][value="00000000-0000-4000-8000-000000000102"]')
      .check();
  } else {
    await expect(page.locator('[name="roomIds"]:checked')).toHaveCount(2);
  }
  await page.getByTestId("guest-submit").click();
  await expect(page.getByTestId("run-status")).toHaveAttribute(
    "data-status",
    exception ? "interrupted" : "completed",
  );
}

for (const [locale, suffix] of [
  ["en", ""],
  ["es", " @mobile"],
] as const) {
  test(`guided scenarios use fresh real bookings, approval and reminder jobs (${locale})${suffix}`, async ({
    page,
  }) => {
    const databaseUrl = process.env.DATABASE_URL;
    const tokenSecret = process.env.LINK_TOKEN_SECRET;
    if (!databaseUrl || !tokenSecret)
      throw new Error("E2E database settings are missing");
    await seedDemo(databaseUrl, tokenSecret);
    await page.goto(`/${locale}/sign-in`);
    await page.getByTestId("demo-enter-host").click();
    await expect(page.getByTestId("guided-demo-panel")).toBeVisible();

    await page.getByTestId("guided-demo-start-vega").click();
    // Reset and guest entry can compile separate routes in a cold dev server.
    await page.waitForURL(new RegExp(`/${locale}/guest$`), { timeout: 30_000 });
    await expect(page.getByTestId("demo-guest-guide")).toHaveAttribute(
      "data-scenario",
      "vega",
    );
    await searchAndSubmit(page, false);
    await page.goto(`/${locale}/guest`);
    await expect(page.getByTestId("guest-status")).toHaveAttribute(
      "data-status",
      "confirmed",
    );

    await page.getByTestId("demo-return-host").click();
    await expect(
      page
        .getByTestId("host-outcomes")
        .locator('[data-visit-outcome="confirmed"]'),
    ).toHaveCount(1);
    const routineChase = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/demo/clock") &&
        response.request().method() === "POST",
      { timeout: 30_000 },
    );
    await page.getByTestId("demo-clock-chase").click();
    expect((await (await routineChase).json()).outcome).toBe("advanced");
    await expect(
      page
        .getByTestId("host-outcomes")
        .locator('[data-visit-outcome="reconfirm_pending"]'),
    ).toHaveCount(1);
    await page.goto(`/${locale}/guest`);
    await page.getByTestId("reconfirm-yes").click();
    await expect(page.getByTestId("guest-status")).toHaveAttribute(
      "data-status",
      "reconfirmed",
    );
    await page.getByTestId("demo-return-host").click();
    await expect(
      page
        .getByTestId("host-outcomes")
        .locator('[data-visit-outcome="reconfirmed"]'),
    ).toHaveCount(1);
    await page.getByTestId("guided-demo-start-otero").click();
    await page.waitForURL(new RegExp(`/${locale}/guest$`), { timeout: 30_000 });
    await expect(page.getByTestId("demo-guest-guide")).toHaveAttribute(
      "data-scenario",
      "otero",
    );
    await searchAndSubmit(page, true);
    await page.goto(`/${locale}`);
    await expect(
      page
        .getByTestId("host-outcomes")
        .locator('[data-visit-outcome="confirmed"]'),
    ).toHaveCount(0);
    await expect(page.getByTestId("pending-decision")).toHaveCount(1);
    await page.getByTestId("approve-decision").click();
    await expect(page.getByTestId("run-status")).toHaveAttribute(
      "data-status",
      "completed",
    );
    await page.goto(`/${locale}`);
    await expect(
      page
        .getByTestId("host-outcomes")
        .locator('[data-visit-outcome="confirmed"]'),
    ).toHaveCount(1);

    for (const action of ["chase", "escalation"] as const) {
      const advanced = page.waitForResponse(
        (response) =>
          response.url().endsWith("/api/demo/clock") &&
          response.request().method() === "POST",
      );
      await page.getByTestId(`demo-clock-${action}`).click();
      expect((await (await advanced).json()).outcome).toBe("advanced");
      await expect(
        page
          .getByTestId("host-outcomes")
          .locator(
            `[data-visit-outcome="${action === "chase" ? "reconfirm_pending" : "escalated"}"]`,
          ),
      ).toHaveCount(1);
      await expect(page.getByTestId(`demo-clock-${action}`)).toBeEnabled();
      const repeated = page.waitForResponse(
        (response) =>
          response.url().endsWith("/api/demo/clock") &&
          response.request().method() === "POST",
      );
      await page.getByTestId(`demo-clock-${action}`).click();
      expect((await (await repeated).json()).outcome).toBe("no_eligible");
      await expect(page.getByTestId("demo-clock-feedback")).toBeVisible();
    }
    await page.goto(`/${locale}/guest`);
    await expect(page.getByTestId("guest-status")).toHaveAttribute(
      "data-status",
      "escalated",
    );
  });
}
