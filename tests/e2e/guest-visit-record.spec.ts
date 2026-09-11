import { randomUUID } from "node:crypto";

import { expect, test, type Locator, type Page } from "@playwright/test";
import postgres from "postgres";

import { hashLinkToken } from "../../src/core/booking/invitations";

type VisitStatus = "cancelled" | "confirmed" | "reconfirm_pending";

let cleanupFixture: (() => Promise<void>) | undefined;

async function fixture(status: VisitStatus) {
  const db = postgres(process.env.DATABASE_URL!, { prepare: false, max: 2 });
  const homeId = randomUUID(),
    hostId = randomUUID(),
    partyId = randomUUID(),
    invitationId = randomUUID(),
    visitId = randomUUID();
  const token = randomUUID();
  let cleaned = false;

  async function cleanup() {
    if (cleaned) return;
    cleaned = true;
    try {
      await db`delete from public.homes where id=${homeId}`;
      const [residue] = await db<
        { count: number }[]
      >`select count(*)::int as count from public.homes where name='Guest visit record test'`;
      expect(residue?.count).toBe(0);
    } finally {
      await db.end({ timeout: 5 });
    }
  }

  try {
    await db`insert into public.homes(id,name,timezone,demo) values(${homeId},'Guest visit record test','Europe/Madrid',false)`;
    await db`insert into public.hosts(id,home_id,display_name,locale) values(${hostId},${homeId},'Host','en')`;
    await db`insert into public.parties(id,home_id,family_name,locale) values(${partyId},${homeId},'Guest Visit Record Family','en')`;
    await db`insert into public.invitations(id,home_id,host_id,party_id,raw_message,link_token,link_token_expires_at) values(${invitationId},${homeId},${hostId},${partyId},'A visit',${hashLinkToken(token, process.env.LINK_TOKEN_SECRET!)},now()+interval '60 days')`;
    await db`insert into public.visits(id,home_id,party_id,invitation_id,stay,adults,children,pets,status) values(${visitId},${homeId},${partyId},${invitationId},daterange(current_date+3,current_date+6,'[)'),2,0,1,${status})`;
    return { cleanup, token };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

async function useFixture(status: VisitStatus) {
  const current = await fixture(status);
  cleanupFixture = current.cleanup;
  return current;
}

test.afterEach(async () => {
  const cleanup = cleanupFixture;
  cleanupFixture = undefined;
  await cleanup?.();
});

async function expectRenderedVisit(page: Page, status: VisitStatus) {
  const guestStatus = page.getByTestId("guest-status");
  await expect(guestStatus).toHaveAttribute("data-status", status);
  await expect(
    page.getByTestId("today-hero").getByRole("heading", { level: 1 }),
  ).toBeVisible();
  await expect(page.getByTestId("today-hero-stamp")).toHaveText(/\S/);
  await expect(page.getByTestId("guest-room-count")).toBeVisible();
  await expect(page.getByTestId("guest-room-labels")).toBeVisible();

  const factList = page
    .getByTestId("guest-room-count")
    .locator("xpath=ancestor::dl");
  const borderWidths = await factList
    .locator("dt, dd")
    .evaluateAll((items) =>
      items.map((item) => getComputedStyle(item).borderBottomWidth),
    );
  expect(borderWidths.length).toBeGreaterThan(0);
  for (const width of borderWidths) expect(width).not.toBe("0px");

  const panel = guestStatus.locator(":scope > div > section").first();
  await expectNonTransparentPanel(panel);
}

async function expectNonTransparentPanel(panel: Locator) {
  const styles = await panel.evaluate((element) => {
    const computed = getComputedStyle(element);
    return {
      backgroundColor: computed.backgroundColor,
      borderTopWidth: computed.borderTopWidth,
    };
  });
  expect(styles.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  expect(styles.borderTopWidth).not.toBe("0px");
}

test("renders a confirmed visit with facts and guest actions", async ({
  page,
}) => {
  const { token } = await useFixture("confirmed");
  await page.goto(`/en/g/${token}`);

  await expectRenderedVisit(page, "confirmed");
  await expect(page.getByTestId("request-change")).toBeVisible();
  await expect(page.getByTestId("reconfirm-yes")).toHaveCount(0);
});

test("renders a cancelled visit with facts and no guest actions", async ({
  page,
}) => {
  const { token } = await useFixture("cancelled");
  await page.goto(`/en/g/${token}`);

  await expectRenderedVisit(page, "cancelled");
  await expect(page.getByTestId("request-change")).toHaveCount(0);
  await expect(page.getByTestId("reconfirm-yes")).toHaveCount(0);
});

test("renders the reconfirmation primary button with fill and contrasting text", async ({
  page,
}) => {
  const { token } = await useFixture("reconfirm_pending");
  await page.goto(`/en/g/${token}`);

  const primaryButton = page.getByTestId("reconfirm-yes");
  await expect(primaryButton).toBeVisible();
  const styles = await primaryButton.evaluate((element) => {
    const computed = getComputedStyle(element);
    return {
      backgroundColor: computed.backgroundColor,
      color: computed.color,
    };
  });
  expect(styles.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  expect(styles.color).not.toBe(styles.backgroundColor);
});
