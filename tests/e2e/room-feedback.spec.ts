import { expect, type Locator, type Page } from "@playwright/test";

import { FakeClock } from "../../src/core/clock";
import { createTemporaryHold } from "../../src/core/booking/holds";
import { fixtureStay } from "../../src/test-support/fixture-household";
import { test } from "./helpers/household";

test.setTimeout(60_000);

async function submit(page: Page, form: Locator) {
  const response = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === new URL(page.url()).pathname,
  );
  await form.getByRole("button", { name: /.+/ }).click();
  expect((await response).status()).toBeLessThan(400);
}

test("room validation preserves the host's details and permits correction", async ({
  page,
  context,
  household,
}) => {
  const [from, to] = fixtureStay(new Date(), 0, 2);
  await household.signIn(context);
  await page.goto("/en/rooms");
  const form = page.locator("form[data-webmcp-host-block]");
  await form.locator('[name="from"]').fill(to);
  await form.locator('[name="to"]').fill(from);
  await form.locator('[name="roomIds"]').first().check();
  await form.locator('[name="publicLabel"]').fill("Family weekend");
  await submit(page, form);
  await expect(form.getByRole("alert")).toContainText("Check the dates");
  await expect(form.locator('[name="from"]')).toHaveValue(to);
  await expect(form.locator('[name="publicLabel"]')).toHaveValue("Family weekend");
  await expect(form.locator('[name="roomIds"]').first()).toBeChecked();

  await form.locator('[name="from"]').fill(from);
  await form.locator('[name="to"]').fill(to);
  await submit(page, form);
  await expect(form.getByRole("status")).toHaveText("Saved.");
  await expect(form.getByRole("alert")).toHaveCount(0);
  const [row] = await household.db<{ count: number }[]>`
    select count(*)::integer as count from public.private_room_blocks
    where home_id = ${household.homeId} and public_label = 'Family weekend'
  `;
  expect(row?.count).toBe(1);
});

test("room conflicts have Spanish feedback and pending forms prevent repeated submission", async ({
  page,
  context,
  household,
}) => {
  const [from, to] = fixtureStay(new Date(), 0, 2);
  const hold = await createTemporaryHold(
    household.db,
    new FakeClock(new Date()),
    {
      invitationId: household.parties[0]!.invitationId,
      stay: [from, to],
      adults: 2,
      roomIds: [household.roomIds[0]!],
    },
  );
  await household.signIn(context);
  await page.goto("/es/rooms");
  const form = page.locator("form[data-webmcp-host-block]");
  await form.locator(`[name="roomIds"][value="${household.roomIds[0]}"]`).check();
  await form.locator('[name="publicLabel"]').fill("Fin de semana familiar");
  await form.locator('[name="from"]').fill(from);
  await form.locator('[name="to"]').fill(to);
  await form.locator('[name="privateNote"]').fill("Revisar el cierre");

  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let received!: () => void;
  const started = new Promise<void>((resolve) => {
    received = resolve;
  });
  await page.route("**/es/rooms", async (route) => {
    if (route.request().method() === "POST") {
      received();
      await gate;
    }
    await route.continue();
  });
  try {
    await form.getByRole("button").click();
    await started;
    await expect(form.getByRole("button")).toBeDisabled();
    await expect(form.getByRole("status")).toHaveText("Guardando…");
  } finally {
    release();
  }
  await expect(form.getByRole("alert")).toContainText("entra en conflicto");
  await expect(form.locator('[name="privateNote"]')).toHaveValue("Revisar el cierre");
  await expect(form.getByRole("button")).toBeEnabled();
  const [visit] = await household.db<{ status: string }[]>`
    select status from public.visits where id = ${hold.visitId}
  `;
  expect(visit?.status).toBe("hold");
});
