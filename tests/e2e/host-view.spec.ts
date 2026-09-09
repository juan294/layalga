import {
  ASYNC_COMPLETION_TIMEOUT,
  clickAndWaitForPost,
  expectRunStatus,
} from "./helpers/async-actions";
import { expect, test } from "@playwright/test";

import { seedDemo } from "../../scripts/seed-demo";
import { createDemoHostCookie } from "../../src/lib/auth/demo-session";

const oterosToken = "o".repeat(43);
const nelHostId = "00000000-0000-4000-8000-000000000201";
test.setTimeout(90_000);

test.beforeEach(async ({ context, page }) => {
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
  await clickAndWaitForPost(page, "host-capture-submit");

  await expect(page.getByTestId("capture-queued")).toBeVisible();
  await expect(page.getByTestId("structured-invitation")).toBeVisible({
    timeout: ASYNC_COMPLETION_TIMEOUT,
  });
  await expect(page.getByTestId("run-timeline-event").first()).toBeVisible();
  await expect(page.getByTestId("guest-link")).toHaveAttribute(
    "href",
    /\/g\/[A-Za-z0-9_-]{43}$/,
  );
});

test("a special request waits for a host and resumes after approval", async ({
  page,
}) => {
  await page.goto(`/en/g/${oterosToken}`);
  await expect(
    page.locator('form[data-webmcp-guest-search][data-hydrated="true"]'),
  ).toBeVisible();
  await clickAndWaitForPost(page, "find-options");
  await page.getByTestId("guest-option").first().check();
  await page.getByTestId("guest-submit").click();
  await expectRunStatus(page, "interrupted");
  // The guest-token branch of /api/runs/[id] must see its own run's timeline.
  await expect(page.getByTestId("run-timeline-event").first()).toBeVisible();

  await page.goto("/en");
  await expect(page.getByTestId("pending-decision")).toBeVisible();
  await Promise.all([
    page.waitForURL(/\/en\/runs\/[0-9a-f-]+\/status/, { timeout: 30_000 }),
    page.getByTestId("approve-decision").click(),
  ]);
  await expectRunStatus(page, "completed");
  await page.getByTestId("run-return").click();
  await expect(page.getByTestId("pending-decision")).toHaveCount(0);
});

test("switches the host view to Spanish", async ({ page }) => {
  const heading = page.getByRole("heading", { level: 1 });
  const englishHeading = await heading.textContent();

  await page.getByTestId("locale-switcher-trigger").click();
  await page.getByTestId("locale-switch-es").click();

  await expect(page).toHaveURL(/\/es(?:\/|$)/);
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(
    englishHeading ?? "",
  );
});

test("the Today overview links onward to the room ledger and visit calendar through the hub", async ({
  page,
}) => {
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Guest stays",
  );
  const hub = page.getByTestId("hub-cards");
  await expect(
    hub.getByRole("heading", { level: 3, name: "Room ledger" }),
  ).toBeVisible();
  await expect(
    hub.getByRole("heading", { level: 3, name: "Visit calendar" }),
  ).toBeVisible();
  // Room administration itself is off the overview now -- it lives at its
  // own route, reached only through the hub card.
  await expect(page.getByTestId("room-ledger")).toHaveCount(0);

  await hub.getByRole("link", { name: /Room ledger/ }).click();
  await expect(page).toHaveURL(/\/en\/rooms$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Room ledger",
  );
  await expect(
    page.getByRole("link", { name: "← Guest stays" }),
  ).toBeVisible();
});

test("shows the room ledger with visible door states", async ({ page }) => {
  await page.goto("/en/rooms");
  const roomLedger = page.getByTestId("room-ledger");
  await expect(roomLedger).toBeVisible();
  await expect(roomLedger.locator("[data-door-state]")).toHaveCount(3);
  await expect(
    roomLedger.locator('[data-door-state="withheld"]'),
  ).toContainText("Withheld");
});

test("shows localized room states in Spanish", async ({ page }) => {
  await page.goto("/es/rooms");
  const ledger = page.getByTestId("room-ledger");
  await expect(ledger).toBeVisible();
  await expect(ledger.locator('[data-door-state="withheld"]')).toContainText(
    "Reservada",
  );
  await expect(
    page.getByRole("heading", { name: "Libro de habitaciones" }),
  ).toBeVisible();
});

test("saves household rules and asks for renewed review after a competing update", async ({
  page,
  context,
}) => {
  const stalePage = await context.newPage();
  await stalePage.goto("/en/settings");
  const staleForm = stalePage.getByTestId("household-policy-form");
  await expect(staleForm).toBeVisible();
  await page.goto("/en/settings");
  const form = page.getByTestId("household-policy-form");
  await form.locator('[name="petsTogetherAllowed"]').check();
  await form.locator('[name="maxFamiliesWithChildren"]').fill("2");
  await form.getByRole("button", { name: "Save household rules" }).click();
  await expect(form.getByRole("status")).toContainText("Household rules saved");
  await staleForm.locator('[name="maxFamiliesWithChildren"]').fill("3");
  await staleForm.getByRole("button", { name: "Save household rules" }).click();
  await expect(staleForm.getByRole("alert")).toContainText(
    "Another host updated the rules",
  );
  await staleForm
    .getByRole("button", { name: "Reload and review current rules" })
    .click();
  await expect(
    staleForm.locator('[name="maxFamiliesWithChildren"]'),
  ).toHaveValue("2");
  await expect(staleForm.locator('[name="petsTogetherAllowed"]')).toBeChecked();
  await stalePage.close();
});

test("puts decisions and current outcomes on the Today overview", async ({
  page,
}) => {
  const headings = await page
    .getByRole("heading", { level: 2 })
    .allTextContents();
  expect(headings.indexOf("Pending decisions")).toBeGreaterThan(-1);
  expect(headings.indexOf("Current visits")).toBeGreaterThan(-1);
  expect(headings.indexOf("Pending decisions")).toBeLessThan(
    headings.indexOf("Current visits"),
  );
  await expect(page.getByTestId("host-outcomes")).toContainText(
    "No upcoming visits yet",
  );
});
