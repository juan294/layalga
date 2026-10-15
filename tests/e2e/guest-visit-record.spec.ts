import { randomUUID } from "node:crypto";

import { expect, type Locator, type Page } from "@playwright/test";

import { test, type OpenHousehold } from "./helpers/household";

type VisitStatus = "cancelled" | "confirmed" | "reconfirm_pending";

test.use({
  householdOptions: {
    rooms: [],
    parties: [{ familyName: "Guest Visit Record Family", pets: 1 }],
  },
});

/** Records one visit in the given status and returns the guest's link token. */
async function visitToken(
  household: OpenHousehold,
  status: VisitStatus,
): Promise<string> {
  const guest = household.parties[0]!;
  await household.db`insert into public.visits(id,home_id,party_id,invitation_id,stay,adults,children,pets,status) values(${randomUUID()},${household.homeId},${guest.partyId},${guest.invitationId},daterange(current_date+3,current_date+6,'[)'),2,0,1,${status})`;
  return guest.token;
}

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

  const panel = page.getByTestId("guest-primary-panel");
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
  household,
  page,
}) => {
  const token = await visitToken(household, "confirmed");
  await page.goto(`/en/g/${token}`);

  await expectRenderedVisit(page, "confirmed");
  await expect(page.getByTestId("request-change")).toBeVisible();
  await expect(page.getByTestId("reconfirm-yes")).toHaveCount(0);
});

test("renders a cancelled visit with facts and no guest actions", async ({
  household,
  page,
}) => {
  const token = await visitToken(household, "cancelled");
  await page.goto(`/en/g/${token}`);

  await expectRenderedVisit(page, "cancelled");
  await expect(page.getByTestId("request-change")).toHaveCount(0);
  await expect(page.getByTestId("reconfirm-yes")).toHaveCount(0);
});

test("renders the reconfirmation primary button with fill and contrasting text", async ({
  household,
  page,
}) => {
  const token = await visitToken(household, "reconfirm_pending");
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
