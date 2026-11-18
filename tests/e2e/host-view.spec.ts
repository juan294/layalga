import { randomUUID } from "node:crypto";
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
  browser,
  household,
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByTestId("host-capture-message")
    .fill(`${VEGA_CAPTURE_MESSAGE}${household.tag}`);
  await page.getByLabel("Invited party").selectOption("returning");
  const returning = page.locator("#capture-party");
  await page.getByTestId("host-capture-submit").click();
  await expect(
    page.getByTestId("host-capture-form").getByRole("alert"),
  ).toHaveText(
    "Choose a current party from this household or select New party.",
  );
  await expect(returning).toBeFocused();
  await expect(page.getByLabel("Invited party")).toHaveValue("returning");
  await expect(page.getByTestId("host-capture-message")).toHaveValue(
    `${VEGA_CAPTURE_MESSAGE}${household.tag}`,
  );
  await returning.press("f");
  await expect(returning).toHaveValue(
    findFixtureGuest(household, "Familia Vega").partyId,
  );
  await expect(returning).not.toHaveAttribute("aria-invalid", "true");
  await expect(
    page.getByTestId("host-capture-form").getByRole("alert"),
  ).toHaveCount(0);
  const history = page.locator("#capture-party-history");
  await expect(history).toContainText("Familia Vega");
  await expect(history).toContainText("Last invited");
  const bounds = await history.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await clickAndWaitForPost(page, "host-capture-submit");

  await expect(page.getByTestId("capture-queued")).toBeVisible();
  await page.getByTestId("capture-status-link").click();
  await expect(page.getByTestId("capture-reveal")).toBeVisible({
    timeout: ASYNC_COMPLETION_TIMEOUT,
  });
  await expect(page.getByTestId("guest-link")).toHaveCount(0);
  const runId = new URL(page.url()).pathname.split("/").at(-2)!;
  const snapshot = await page.request.get(`/api/runs/${runId}`);
  expect(await snapshot.text()).not.toMatch(/\/g\/[A-Za-z0-9_-]{43}/);
  await clickAndWaitForPost(page, "capture-reveal");
  await expect(page.getByTestId("structured-invitation")).toBeVisible({
    timeout: ASYNC_COMPLETION_TIMEOUT,
  });
  await expect(page.getByTestId("run-timeline-event").first()).toBeVisible();
  await expect(page.getByTestId("guest-link")).toHaveAttribute(
    "href",
    /\/g\/[A-Za-z0-9_-]{43}$/,
  );
  const original = (await page.getByTestId("guest-link").getAttribute("href"))!;
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByTestId("copy-guest-link").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("copy-guest-link")).toHaveText("Copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    original,
  );
  await page.goto("/es");
  await page
    .locator("#capture-history")
    .getByRole("link", { name: new RegExp(runId) })
    .click();
  await page.reload();
  await expect(page.getByTestId("guest-link")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Mostrar enlace de invitación" })
    .click();
  await expect(page.getByTestId("guest-link")).toHaveAttribute(
    "href",
    original,
  );
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error("denied");
        },
      },
    }),
  );
  await page.getByTestId("copy-guest-link").click();
  const manual = page.locator("input[readonly]");
  await expect(manual).toHaveValue(original);
  await manual.focus();
  expect(
    await manual.evaluate((el) => (el as HTMLInputElement).selectionEnd),
  ).toBe(original.length);
  const guest = await browser.newContext();
  try {
    const other = await guest.newPage();
    await other.goto(original);
    await expect(other.getByTestId("guest-status")).toHaveAttribute(
      "data-status",
      "invited",
    );
    await expect(other.getByTestId("guest-status")).toContainText(
      "Familia Vega",
    );
    await expect(other.getByTestId("capture-reveal")).toHaveCount(0);
  } finally {
    await guest.close();
  }
});

test("legacy capture progress waits for confirmation and preserves the original until replacement", async ({
  household,
  page,
  browser,
}) => {
  const fixture = findFixtureGuest(household, "Familia Vega");
  const runId = randomUUID(),
    hostId = household.hostIds[0]!;
  const task = {
    task: "host_capture",
    homeId: household.homeId,
    hostId,
    locale: "en",
    rawMessage: "Synthetic legacy capture",
  };
  await household.db`insert into public.runs(id,home_id,task,session_id,status,payload) values
   (${runId},${household.homeId},'host_capture',${"capture_" + hostId},'queued',${household.db.json(task)})`;
  const path = `/en/runs/${runId}/status`;
  await page.goto(path);
  await expect(page.getByTestId("run-status")).toHaveAttribute(
    "data-status",
    "queued",
  );
  await expect(page.getByTestId("capture-reveal")).toHaveCount(0);
  await page.reload();
  await household.db.begin(async (tx) => {
    await tx`insert into public.audit_events(home_id,run_id,actor,kind,payload) values
   (${household.homeId},${runId},'agent','tool_call',${tx.json({ name: "capture_invitation", invitationId: fixture.invitationId })})`;
    await tx`update public.runs set status='completed', finished_at=now() where id=${runId}`;
  });
  await page
    .getByTestId("capture-reveal")
    .click({ timeout: ASYNC_COMPLETION_TIMEOUT });
  await expect(page.getByText(/Replacing it will invalidate/)).toBeVisible();
  const prior =
    await household.db`select link_token,link_token_expires_at from public.invitations where id=${fixture.invitationId}`;
  await page.getByRole("button", { name: "Keep the existing link" }).click();
  await expect(page.getByTestId("capture-reveal")).toBeVisible();
  expect(
    await household.db`select link_token,link_token_expires_at from public.invitations where id=${fixture.invitationId}`,
  ).toEqual(prior);
  const guest = await browser.newContext();
  try {
    const visitor = await guest.newPage();
    await visitor.goto(new URL(`/es/g/${fixture.token}`, page.url()).href);
    await expect(visitor.getByTestId("guest-status")).toHaveAttribute(
      "data-status",
      "invited",
    );
    await expect(visitor.getByTestId("guest-status")).toContainText(
      fixture.familyName,
    );
    await page.getByTestId("capture-reveal").click();
    await page.getByRole("button", { name: "Replace the guest link" }).click();
    const link = page.getByTestId("guest-link");
    await expect(link).toBeVisible();
    const issued = (await link.getAttribute("href"))!;
    await visitor.reload();
    await expect(visitor.getByTestId("guest-status")).toHaveAttribute(
      "data-status",
      "invalid",
    );
    await visitor.goto(issued);
    await expect(visitor.getByTestId("guest-status")).toHaveAttribute(
      "data-status",
      "invited",
    );
    await expect(visitor.getByTestId("guest-status")).toContainText(
      fixture.familyName,
    );
    await visitor.goto(new URL(path, page.url()).href);
    await expect(visitor.getByTestId("capture-reveal")).toHaveCount(0);
  } finally {
    await guest.close();
  }
});

test("only the original host can retry a failed capture from its status", async ({
  browser,
  household,
  page,
}) => {
  const id = randomUUID(),
    hostId = household.hostIds[0]!;
  const retryTask = {
    task: "host_capture_v2",
    hostId,
    homeId: household.homeId,
    captureId: randomUUID(),
    partyChoice: { kind: "new" },
    locale: "en",
    rawMessage: "Invite Willow family for a weekend " + household.tag,
  };
  await household.db`insert into public.runs(id,home_id,task,session_id,status,payload) values
 (${id},${household.homeId},'host_capture_v2',${"capture_" + hostId},'failed',${household.db.json(retryTask)})`;
  const [cohost] = await household.db<
    { id: string }[]
  >`insert into public.hosts(home_id,display_name,locale) values (${household.homeId},'Co-host','en') returning id`;
  const other = await browser.newContext();
  const path = `/en/runs/${id}/status`;
  try {
    const { signInAsHost } =
      await import("../../src/test-support/host-session");
    await signInAsHost(other, { sql: household.db, hostId: cohost!.id });
    const peer = await other.newPage();
    await peer.goto(new URL(path, page.url()).href);
    await expect(peer.getByTestId("run-status")).toHaveAttribute(
      "data-status",
      "failed",
    );
    await expect(
      peer.getByRole("button", { name: "Retry this capture" }),
    ).toHaveCount(0);
    await expect(peer.getByTestId("capture-reveal")).toHaveCount(0);
    await page.goto(path);
    await page.getByRole("button", { name: "Retry this capture" }).click();
    await page
      .getByTestId("capture-reveal")
      .click({ timeout: ASYNC_COMPLETION_TIMEOUT });
    await expect(page.getByTestId("guest-link")).toBeVisible();
    const records =
      await household.db`select id,status,request_attempt_count from public.runs where home_id=${household.homeId}`;
    expect(records).toEqual([
      { id, status: "completed", request_attempt_count: 2 },
    ]);
    await peer.reload();
    await expect(peer.getByTestId("run-status")).toHaveAttribute(
      "data-status",
      "completed",
    );
    await expect(peer.getByTestId("capture-reveal")).toHaveCount(0);
  } finally {
    await other.close();
  }
});
test("an exhausted capture shows its reference and a way back to the dashboard", async ({
  household,
  page,
}) => {
  const id = randomUUID(),
    hostId = household.hostIds[0]!;
  await household.db`insert into public.runs(id,home_id,task,session_id,status,request_attempt_count,payload) values
 (${id},${household.homeId},'host_capture',${"capture_" + hostId},'failed',3,${household.db.json({ task: "host_capture", homeId: household.homeId, hostId, locale: "en", rawMessage: "Fixture invitation" })})`;
  await page.goto(`/es/runs/${id}/status`);
  await expect(page.getByText(id)).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Volver a crear invitaciones" }),
  ).toBeVisible();
  await expect(page.getByTestId("capture-reveal")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reintentar" })).toHaveCount(0);
});
test("a removed returning selection keeps the draft and accepts a new choice", async ({
  household,
  page,
}) => {
  const [stale] = await household.db<
    { id: string }[]
  >`insert into public.parties (home_id, family_name, locale)
    values (${household.homeId}, 'Grupo temporal', 'es') returning id`;
  await page.goto("/es");
  await page.locator("#capture-party-kind").selectOption("returning");
  await page.locator("#capture-party").selectOption(stale!.id);
  const message = page.getByTestId("host-capture-message");
  await message.fill(`${VEGA_CAPTURE_MESSAGE}${household.tag}`);
  await household.db`delete from public.parties where id = ${stale!.id} and home_id = ${household.homeId}`;
  await clickAndWaitForPost(page, "host-capture-submit");
  await expect(
    page.getByTestId("host-capture-form").getByRole("alert"),
  ).toHaveText("Elige un grupo actual de esta casa o selecciona Grupo nuevo.");
  await expect(message).toHaveValue(`${VEGA_CAPTURE_MESSAGE}${household.tag}`);
  await page
    .locator("#capture-party")
    .selectOption(findFixtureGuest(household, "Familia Vega").partyId);
  await clickAndWaitForPost(page, "host-capture-submit");
  await page
    .getByTestId("capture-reveal")
    .click({ timeout: ASYNC_COMPLETION_TIMEOUT });
  await expect(page.getByTestId("guest-link")).toBeVisible({
    timeout: ASYNC_COMPLETION_TIMEOUT,
  });
});

test("New permits a shared name and Returning uses the selected dated history", async ({
  household,
  page,
}) => {
  const prior = findFixtureGuest(household, "Familia Vega");
  await household.db`update public.invitations set created_at='2025-06-11T12:00:00Z' where id=${prior.invitationId}`;
  await expect(page.getByLabel("Invited party")).toHaveValue("new");
  await page
    .getByTestId("host-capture-message")
    .fill(`${VEGA_CAPTURE_MESSAGE}${household.tag}`);
  await clickAndWaitForPost(page, "host-capture-submit");
  await page
    .getByTestId("capture-reveal")
    .click({ timeout: ASYNC_COMPLETION_TIMEOUT });
  await expect(page.getByTestId("guest-link")).toBeVisible({
    timeout: ASYNC_COMPLETION_TIMEOUT,
  });
  const [created] = await household.db<
    { id: string }[]
  >`select id from public.parties where home_id=${household.homeId}
    and family_name='Familia Vega' and id<>${prior.partyId}`;
  expect(created).toBeDefined();
  await page.reload();
  await page.getByLabel("Invited party").selectOption("returning");
  const choices = page.locator("#capture-party");
  await expect(choices).toHaveValue("");
  const matching = choices.getByRole("option", { name: /Familia Vega/ });
  await expect(matching).toHaveCount(2);
  expect(new Set(await matching.allTextContents()).size).toBe(2);
  await choices.selectOption(prior.partyId);
  await expect(page.locator("#capture-party-history")).toContainText(
    "Jun 11, 2025",
  );
  await page
    .getByTestId("host-capture-message")
    .fill(`Return visit for our friends ${household.tag}`);
  await clickAndWaitForPost(page, "host-capture-submit");
  await page
    .getByTestId("capture-reveal")
    .click({ timeout: ASYNC_COMPLETION_TIMEOUT });
  await expect(page.getByTestId("guest-link")).toBeVisible({
    timeout: ASYNC_COMPLETION_TIMEOUT,
  });
  const counts = await household.db<
    { party_id: string; count: number }[]
  >`select party_id,count(*)::int as count from public.invitations
    where home_id=${household.homeId} and party_id in (${prior.partyId}, ${created!.id}) group by party_id`;
  expect(counts).toEqual(
    expect.arrayContaining([
      { party_id: prior.partyId, count: 2 },
      { party_id: created!.id, count: 1 },
    ]),
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
