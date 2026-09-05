import { randomUUID } from "node:crypto";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it, vi } from "vitest";

import en from "../../../messages/en.json";
import es from "../../../messages/es.json";
import { closeDatabase, getDatabaseConnection } from "@/core/db/client";
import { HostOutcomes } from "./host-outcomes";

vi.mock("next-intl/server", () => ({
  getTranslations: async ({ locale }: { locale: "en" | "es" }) => {
    const messages = (locale === "es" ? es : en).HostOutcomes as Record<
      string,
      string | Record<string, string>
    >;
    return (key: string) => {
      const [group, name] = key.split(".");
      return name
        ? (messages[group!] as Record<string, string>)[name]
        : messages[group!];
    };
  },
}));

const sql = getDatabaseConnection().sql;
afterAll(() => closeDatabase());

async function fixture(
  status: "reconfirm_pending" | "escalated" | "confirmed" | "reconfirmed",
) {
  const homeId = randomUUID();
  const hostId = randomUUID();
  const partyId = randomUUID();
  const invitationId = randomUUID();
  await sql`insert into public.homes(id,name,timezone,demo)
    values(${homeId},'Synthetic outcome review','Europe/Madrid',true)`;
  await sql`insert into public.hosts(id,home_id,display_name,locale)
    values(${hostId},${homeId},'Synthetic host','en')`;
  await sql`insert into public.parties(id,home_id,family_name,locale)
    values(${partyId},${homeId},'Synthetic unanswered visit','en')`;
  await sql`insert into public.invitations(id,home_id,host_id,party_id,raw_message)
    values(${invitationId},${homeId},${hostId},${partyId},'Synthetic invitation')`;
  await sql`insert into public.visits(home_id,party_id,invitation_id,stay,adults,status,confirmed_at,reconfirm_requested_at)
    values(${homeId},${partyId},${invitationId},daterange('2027-09-19','2027-09-22','[)'),2,${status},'2027-09-01T09:00:00Z','2027-09-16T07:00:00Z')`;
  // Madrid has reached the scheduled arrival day; UTC is still the previous day.
  await sql`insert into public.demo_clock(home_id,now,enabled)
    values(${homeId},'2027-09-18T22:15:00Z',true)`;
  return homeId;
}

describe("current host outcomes on the scheduled arrival day", () => {
  it.each([
    ["reconfirm_pending", "en"],
    ["reconfirm_pending", "es"],
    ["escalated", "en"],
    ["escalated", "es"],
  ] as const)(
    "preserves %s and its next action in %s",
    async (status, locale) => {
      const homeId = await fixture(status);
      try {
        const html = renderToStaticMarkup(
          await HostOutcomes({ homeId, locale }),
        );
        const messages = (locale === "es" ? es : en).HostOutcomes;
        expect(html).toContain(`data-visit-outcome="${status}"`);
        expect(html).toContain(messages.status[status]);
        expect(html).toContain(messages.next[status]);
        expect(html).not.toContain('data-visit-outcome="arrived"');
      } finally {
        await sql`delete from public.homes where id=${homeId}`;
      }
    },
  );

  it.each(["confirmed", "reconfirmed"] as const)(
    "allows the scheduled date outcome for a %s visit without claiming physical arrival",
    async (status) => {
      const homeId = await fixture(status);
      try {
        const html = renderToStaticMarkup(
          await HostOutcomes({ homeId, locale: "en" }),
        );
        expect(html).toContain('data-visit-outcome="arrived"');
        expect(html).toContain(en.HostOutcomes.status.arrived);
        expect(html).not.toMatch(/guest(?:s)? (?:has|have) arrived/i);
      } finally {
        await sql`delete from public.homes where id=${homeId}`;
      }
    },
  );
});
