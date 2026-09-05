import { clickAndWaitForPost, expectRunStatus } from "./helpers/async-actions";
import { expect, test, type Page } from "@playwright/test";

import { DEMO_SEED, seedDemo } from "../../scripts/seed-demo";

import {
  createDemoHostCookie,
  DEMO_HOST_COOKIE,
} from "../../src/lib/auth/demo-session";

test.setTimeout(150_000);

test("guided and clock controls wait for JavaScript before accepting clicks", async ({
  page,
  context,
}) => {
  await seedDemo(process.env.DATABASE_URL!, process.env.LINK_TOKEN_SECRET!);
  await context.addCookies([
    {
      name: DEMO_HOST_COOKIE,
      value: createDemoHostCookie(DEMO_SEED.hosts[0].id),
      url: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3008",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  let releaseScripts!: () => void;
  const scriptsReady = new Promise<void>((resolve) => {
    releaseScripts = resolve;
  });
  await page.route("**/*", async (route) => {
    if (route.request().resourceType() === "script") await scriptsReady;
    await route.continue();
  });
  const posts: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (
      request.method() === "POST" &&
      (path === "/api/demo/clock" ||
        path === "/api/demo/reset" ||
        path === "/en/demo-enter-guest")
    )
      posts.push(path);
  });
  try {
    await page.goto("/en", { waitUntil: "commit" });
    await expect(page.getByTestId("guided-demo-start-vega")).toBeVisible();
    await expect(page.getByTestId("guided-demo-start-vega")).toBeDisabled();
    await expect(page.getByTestId("guided-demo-start-otero")).toBeDisabled();
    await expect(page.getByTestId("demo-clock-chase")).toBeDisabled();
    await expect(page.getByTestId("demo-clock-escalation")).toBeDisabled();
    await expect(page.locator("#demo-clock-custom")).toBeDisabled();
    expect(posts).toEqual([]);
  } finally {
    releaseScripts();
  }
  const clock = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/demo/clock" &&
      response.request().method() === "POST",
  );
  await page.getByTestId("demo-clock-chase").click();
  expect((await (await clock).json()).outcome).toBe("no_eligible");
  await page.getByTestId("guided-demo-start-vega").click();
  await page.waitForURL(/\/en\/guest$/, { timeout: 30_000 });
  await expect(page.getByTestId("demo-guest-guide")).toHaveAttribute(
    "data-scenario",
    "vega",
  );
  expect(posts).toEqual([
    "/api/demo/clock",
    "/api/demo/reset",
    "/en/demo-enter-guest",
  ]);
});

async function searchAndSubmit(page: Page, exception: boolean) {
  await expect(
    page.locator('form[data-webmcp-guest-search][data-hydrated="true"]'),
  ).toBeVisible();
  await clickAndWaitForPost(page, "find-options");
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
  await expectRunStatus(page, exception ? "interrupted" : "completed");
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
    await clickAndWaitForPost(page, "reconfirm-yes");
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
    await expectRunStatus(page, "completed");
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
