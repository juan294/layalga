import {
  ASYNC_COMPLETION_TIMEOUT,
  clickAndWaitForPost,
  expectRunStatus,
} from "./helpers/async-actions";
import { expect } from "@playwright/test";
import type { Sql } from "postgres";

import {
  findFixtureGuest,
  VEGA_CAPTURE_MESSAGE,
} from "../../src/test-support/fixture-household";
import { test } from "./helpers/household";

test.setTimeout(90_000);

const GOOGLE_PHOTO = "https://lh3.googleusercontent.com/a/e2e-photo=s96-c";
// A 1x1 PNG, so the browser decodes a real image under the CSP.
const PHOTO_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAHnOcQAAAAABJRU5ErkJggg==",
  "base64",
);

let hostAccount: { userId: string; email: string };

/** Gives the signed-in fixture user a Google identity, as the provider would. */
async function addGoogleIdentity(db: Sql, userId: string, picture: string) {
  await db`
    insert into auth.identities (
      provider_id, user_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    )
    values (
      ${`google-${userId}`},
      ${userId},
      ${db.json({ sub: userId, picture })},
      'google',
      now(), now(), now()
    )
  `;
}

test.beforeEach(async ({ context, household, page }) => {
  hostAccount = await household.signIn(context);
  await page.goto("/en");
  await expect(page.getByTestId("host-capture-form")).toBeVisible();
});

test("captures an invitation and exposes its private guest link", async ({
  household,
  page,
}) => {
  await page
    .getByTestId("host-capture-message")
    .fill(`${VEGA_CAPTURE_MESSAGE}${household.tag}`);
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
  household,
  page,
}) => {
  await page.goto(`/en/g/${findFixtureGuest(household, "The Parkers").token}`);
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

test("the header shows the signed-in account as a monogram without a Google identity", async ({
  page,
}) => {
  const chip = page.getByTestId("account-chip");

  await expect(chip).toContainText(hostAccount.email);
  await expect(chip).toContainText("Signed in as");
  await expect(chip).toHaveAttribute("title", hostAccount.email);
  await expect(chip.locator(".site-header__account-initial")).toHaveText("H");
  await expect(chip.locator("img")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
});

test("the header loads the Google avatar under the CSP and sends no referrer", async ({
  household,
  page,
}) => {
  await addGoogleIdentity(household.db, hostAccount.userId, GOOGLE_PHOTO);
  const violations: string[] = [];
  page.on("console", (message) => {
    if (/content security policy/i.test(message.text())) {
      violations.push(message.text());
    }
  });
  let photoRequestHeaders: Record<string, string> | undefined;
  await page.route("https://*.googleusercontent.com/**", async (route) => {
    photoRequestHeaders = await route.request().allHeaders();
    await route.fulfill({ body: PHOTO_PNG, contentType: "image/png" });
  });

  await page.goto("/en");
  const photo = page.getByTestId("account-chip").locator("img");

  await expect(photo).toHaveAttribute("src", GOOGLE_PHOTO);
  await expect
    .poll(() => photo.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  expect(violations).toEqual([]);
  expect(photoRequestHeaders, "the avatar was requested").toBeDefined();
  expect(photoRequestHeaders).not.toHaveProperty("referer");
});

test("the monogram stays visible when the Google avatar is blocked", async ({
  household,
  page,
}) => {
  await addGoogleIdentity(household.db, hostAccount.userId, GOOGLE_PHOTO);
  await page.route("https://*.googleusercontent.com/**", (route) =>
    route.abort(),
  );

  await page.goto("/en");
  const chip = page.getByTestId("account-chip");
  const monogram = chip.locator(".site-header__account-initial");

  await expect(monogram).toBeVisible();
  await expect(monogram).toHaveText("H");
  await expect(chip).toContainText(hostAccount.email);
  await expect
    .poll(() =>
      chip.locator("img").evaluate((img: HTMLImageElement) => img.complete),
    )
    .toBe(true);
  expect(
    await chip
      .locator("img")
      .evaluate((img: HTMLImageElement) => img.naturalWidth),
  ).toBe(0);
});

test("the Today overview links onward to the room ledger and visit calendar through the hub", async ({
  page,
}) => {
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Household ledger",
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
    page.getByRole("link", { name: "← Household ledger" }),
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

test("names the host dashboard in Spanish", async ({ page }) => {
  await page.goto("/es");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Libro del hogar",
  );
  await page.goto("/es/rooms");
  await expect(
    page.getByRole("link", { name: "← Libro del hogar" }),
  ).toBeVisible();
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

test.describe("an empty household", () => {
  test.use({ householdOptions: { rooms: [], parties: [] } });

  test("renders the dashboard and adds its first room", async ({
    household,
    page,
  }) => {
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Household ledger",
    );
    await page.goto("/en/rooms");
    const ledger = page.getByTestId("room-ledger");
    await expect(ledger).toBeVisible();
    await expect(ledger.locator("[data-door-state]")).toHaveCount(0);

    const addRoom = ledger.locator("details", {
      has: page.getByText("Add a room", { exact: true }),
    });
    await addRoom.locator("summary").click();
    const form = addRoom.locator("form");
    await form.locator('[name="name"]').fill("Attic room");
    await form.locator('[name="guestLabel"]').fill("Attic");
    await form.locator('[name="floorLabel"]').fill("Top floor");
    await form.locator('[name="sleepingArrangement"]').fill("One double bed");
    await form.locator('[name="inventoryState"]').selectOption("available");
    await form.locator('button[type="submit"]').click();
    await expect(ledger.locator("[data-door-state]")).toHaveCount(1);
    const [rooms] = await household.db<{ count: number }[]>`
      select count(*)::int as count from public.rooms
      where home_id = ${household.homeId}
    `;
    expect(rooms?.count).toBe(1);
  });
});
