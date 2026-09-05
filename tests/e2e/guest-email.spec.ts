import { clickAndWaitForPost } from "./helpers/async-actions";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { SystemClock } from "../../src/core/clock";
import { hashLinkToken } from "../../src/core/booking/invitations";
import {
  loadLiveGuestContact,
  mintGuestCapability,
  registerGuestContact,
  verifyGuestContact,
} from "../../src/core/notifications/guest-contact";

test.setTimeout(90_000);

async function fixture() {
  const db = postgres(process.env.DATABASE_URL!, { prepare: false, max: 2 });
  const homeId = randomUUID(),
    hostId = randomUUID(),
    partyId = randomUUID(),
    invitationId = randomUUID(),
    visitId = randomUUID();
  const originalToken = randomUUID();
  await db`insert into public.homes(id,name,timezone,demo) values(${homeId},'Email journey test','Europe/Madrid',false)`;
  await db`insert into public.hosts(id,home_id,display_name,locale) values(${hostId},${homeId},'Host','en')`;
  await db`insert into public.parties(id,home_id,family_name,locale) values(${partyId},${homeId},'Email Guest Family','en')`;
  await db`insert into public.invitations(id,home_id,host_id,party_id,raw_message,link_token,link_token_expires_at) values(${invitationId},${homeId},${hostId},${partyId},'A visit',${hashLinkToken(originalToken, process.env.LINK_TOKEN_SECRET!)},now()+interval '60 days')`;
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
  return {
    db,
    homeId,
    visitId,
    invitationId,
    originalToken,
    verification,
    async cleanup() {
      await db`delete from public.homes where id=${homeId}`;
      await db.end({ timeout: 5 });
    },
  };
}

test("email verification GET is read-only; explicit POST returns to the real visit for reconfirmation and cancellation", async ({
  page,
}) => {
  const f = await fixture();
  try {
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
  } finally {
    await f.cleanup();
  }
});

test("reminder return keeps original bearer access and explicit opt-out revokes the email session", async ({
  page,
}) => {
  const f = await fixture();
  try {
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
    await page
      .getByTestId("guest-email-preferences")
      .locator("summary")
      .click();
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
  } finally {
    await f.cleanup();
  }
});
