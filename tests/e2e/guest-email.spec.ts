import { clickAndWaitForPost } from "./helpers/async-actions";
import { randomUUID } from "node:crypto";
import { expect } from "@playwright/test";
import { SystemClock } from "../../src/core/clock";
import {
  loadLiveGuestContact,
  mintGuestCapability,
  registerGuestContact,
  verifyGuestContact,
} from "../../src/core/notifications/guest-contact";
import { test, type OpenHousehold } from "./helpers/household";

test.setTimeout(90_000);
test.use({
  householdOptions: {
    rooms: [],
    parties: [{ familyName: "Email Guest Family" }],
  },
});

/** A reconfirmation-pending visit whose guest enrolled an email contact. */
async function enrolledGuest(household: OpenHousehold) {
  const { db } = household;
  const { homeId } = household;
  const { partyId, invitationId, token: originalToken } = household.parties[0]!;
  const visitId = randomUUID();
  await db`insert into public.visits(id,home_id,party_id,invitation_id,stay,adults,status,reconfirm_requested_at) values(${visitId},${homeId},${partyId},${invitationId},daterange(current_date+3,current_date+6,'[)'),2,'reconfirm_pending',now())`;
  // Local-only enrollment and token construction. No email dispatcher or sender is called.
  await registerGuestContact(
    db,
    {
      homeId,
      partyId,
      invitationId,
      email: "guest@example.test",
      locale: "en",
      consent: true,
    },
    new SystemClock(),
  );
  const [contact] = await db<
    { id: string }[]
  >`select id from public.guest_contacts where invitation_id=${invitationId}`;
  const row = await loadLiveGuestContact(db, contact!.id, new Date());
  const verification = mintGuestCapability(row!, "verify", new Date());
  return { db, visitId, invitationId, originalToken, verification };
}

test("email verification GET is read-only; explicit POST returns to the real visit for reconfirmation and cancellation", async ({
  household,
  page,
}) => {
  const f = await enrolledGuest(household);
  await page.goto(
    `/en/guest/verify?capability=${encodeURIComponent(f.verification)}`,
  );
  await expect(page.getByTestId("guest-email-verification")).toHaveAttribute(
    "data-valid",
    "true",
  );
  const [before] = await f.db<
    { verified_at: Date | null; status: string }[]
  >`select contact.verified_at, visit.status from public.guest_contacts contact join public.visits visit on visit.invitation_id=contact.invitation_id where contact.invitation_id=${f.invitationId}`;
  expect(before).toEqual({ verified_at: null, status: "reconfirm_pending" });
  await page.getByTestId("guest-email-verify").click();
  await expect(page).toHaveURL(/\/en\/guest\?email=enabled/);
  await expect(page.getByTestId("guest-status")).toHaveAttribute(
    "data-status",
    "reconfirm_pending",
  );
  await expect(page.getByTestId("guest-status")).toContainText(
    "Email Guest Family",
  );
  await expect(page.getByTestId("guest-status")).not.toContainText(
    "synthetic demo",
  );
  await clickAndWaitForPost(page, "reconfirm-yes");
  await expect(page.getByTestId("guest-status")).toHaveAttribute(
    "data-status",
    "reconfirmed",
  );
  await page.locator("#cancel-request summary").click();
  await page.locator('#cancel-request [name="confirmed"]').check();
  await page.getByTestId("confirm-cancellation").click();
  await expect(page).toHaveURL(/\/en\/cancellation-complete$/);
  const [visit] = await f.db<
    { status: string }[]
  >`select status from public.visits where id=${f.visitId}`;
  expect(visit?.status).toBe("cancelled");
  await page.goto(
    `/en/guest/verify?capability=${encodeURIComponent(f.verification)}`,
  );
  await expect(page.getByTestId("guest-email-verification")).toHaveAttribute(
    "data-valid",
    "false",
  );
});

test("reminder return keeps original bearer access and explicit opt-out revokes the email session", async ({
  household,
  page,
}) => {
  const f = await enrolledGuest(household);
  const verified = await verifyGuestContact(
    f.db,
    f.verification,
    new SystemClock(),
  );
  const link = `/en/guest/return?capability=${encodeURIComponent(verified!.capability)}`;
  await page.goto(link);
  await expect(page).toHaveURL(/\/en\/guest$/);
  expect(new URL(page.url()).origin).toBe(
    new URL(process.env.E2E_BASE_URL ?? "http://127.0.0.1:3008").origin,
  );
  await expect(page.getByTestId("guest-status")).toHaveAttribute(
    "data-status",
    "reconfirm_pending",
  );
  await page.getByTestId("guest-email-preferences").locator("summary").click();
  await page.getByTestId("guest-email-disable").click();
  await expect(page).toHaveURL(/\/en\/guest\/email-status$/);
  await page.goto(link);
  await expect(page.getByTestId("guest-email-verification")).toHaveAttribute(
    "data-valid",
    "false",
  );
  await page.goto(`/en/g/${f.originalToken}`);
  await expect(page.getByTestId("guest-status")).toHaveAttribute(
    "data-status",
    "reconfirm_pending",
  );
});
