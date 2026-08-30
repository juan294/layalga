import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import { FakeClock } from "@/core/clock";

import { NoopScheduler } from "./deps";
import { runAgentTask } from "./run-task";
import { ScriptedModel } from "./scripted-model";

const url =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54622/postgres";
const sql = postgres(url, { prepare: false });

describe("agent task authority", () => {
  afterAll(() => sql.end());

  it("rejects a model-selected invitation from another home", async () => {
    const [homeA, homeB] = await Promise.all([
      seedHome("Scoped A"),
      seedHome("Scoped B"),
    ]);
    try {
      const model = new ScriptedModel([
        {
          toolUse: {
            name: "create_temporary_hold",
            input: {
              invitationId: homeB.invitationId,
              stay: ["2026-10-02", "2026-10-04"],
              adults: 2,
              children: 0,
              pets: 0,
              specialRequests: [],
            },
          },
        },
        { text: "The request could not be applied." },
      ]);

      await runAgentTask(
        {
          task: "guest_submit",
          homeId: homeA.homeId,
          invitationId: homeA.invitationId,
          stay: ["2026-10-02", "2026-10-04"],
          adults: 2,
          children: 0,
          pets: 0,
          locale: "en",
        },
        {
          db: sql,
          clock: new FakeClock(new Date("2026-09-01T10:00:00Z")),
          scheduler: new NoopScheduler(),
          appUrl: "http://localhost:3008",
          locale: "en",
          model,
        },
      ).catch(() => undefined);

      expect(
        await sql`
          select id from public.visits
          where invitation_id in (${homeA.invitationId}, ${homeB.invitationId})
        `,
      ).toHaveLength(0);
      await expect(
        runAgentTask(
          {
            task: "guest_submit",
            homeId: homeA.homeId,
            invitationId: homeB.invitationId,
            stay: ["2026-10-02", "2026-10-04"],
            adults: 2,
            children: 0,
            pets: 0,
            locale: "en",
          },
          {
            db: sql,
            clock: new FakeClock(new Date("2026-09-01T10:00:00Z")),
            scheduler: new NoopScheduler(),
            appUrl: "http://localhost:3008",
            locale: "en",
            model,
          },
        ),
      ).rejects.toThrow("does not belong to the task home");
    } finally {
      await sql`delete from public.homes where id in (${homeA.homeId}, ${homeB.homeId})`;
    }
  });

  it("keeps raw bearer links out of agent transcripts", async () => {
    const fixture = await seedHome("Private link");
    const [host] = await sql<{ id: string }[]>`
      select id from public.hosts where home_id = ${fixture.homeId}
    `;
    const previousSecret = process.env.LINK_TOKEN_SECRET;
    process.env.LINK_TOKEN_SECRET = "agent-transcript-test-secret";
    try {
      const result = await runAgentTask(
        {
          task: "host_capture",
          homeId: fixture.homeId,
          hostId: host!.id,
          rawMessage: "Invite the Vega family for a weekend.",
          locale: "en",
        },
        {
          db: sql,
          clock: new FakeClock(new Date("2026-09-01T10:00:00Z")),
          scheduler: new NoopScheduler(),
          appUrl: "https://example.test",
          locale: "en",
          model: new ScriptedModel([
            {
              toolUse: {
                name: "capture_invitation",
                input: {
                  partyName: "Vega",
                  partyLocale: "en",
                  adults: 2,
                  children: 0,
                  pets: 0,
                  flexibleDates: { text: "a weekend" },
                  specialRequests: [],
                  rawMessage: "Invite the Vega family for a weekend.",
                },
              },
            },
            { text: "The private invitation is ready." },
          ]),
        },
      );
      const [run] = await sql<{ persisted: string }[]>`
        select coalesce(payload::text, '') || coalesce(result::text, '') as persisted
        from public.runs where id = ${result.runId}
      `;
      const audits = await sql<{ payload: unknown }[]>`
        select payload from public.audit_events where run_id = ${result.runId}
      `;
      const sessions = await sql<{ data: string }[]>`
        select encode(data, 'escape') as data
        from public.agent_sessions where session_id = ${result.sessionId}
      `;
      expect(result.summary).not.toContain("/g/");
      expect(run?.persisted).not.toContain("/g/");
      expect(JSON.stringify(audits)).not.toContain("/g/");
      expect(JSON.stringify(sessions)).not.toContain("/g/");
    } finally {
      if (previousSecret === undefined) delete process.env.LINK_TOKEN_SECRET;
      else process.env.LINK_TOKEN_SECRET = previousSecret;
      await sql`delete from public.homes where id = ${fixture.homeId}`;
      await sql`delete from public.agent_sessions where session_id = ${`capture_${host!.id}`}`;
    }
  });

  it("rejects cross-home room relationships at the database boundary", async () => {
    const [homeA, homeB] = await Promise.all([
      seedHome("Constraint A"),
      seedHome("Constraint B"),
    ]);
    try {
      const [visit] = await sql<{ id: string }[]>`
        insert into public.visits (
          home_id, party_id, invitation_id, stay, adults, status
        )
        select invitation.home_id, invitation.party_id, invitation.id,
          daterange('2026-10-02', '2026-10-04', '[)'), 1, 'hold'
        from public.invitations as invitation
        where invitation.id = ${homeA.invitationId}
        returning id
      `;
      const [otherRoom] = await sql<{ id: string }[]>`
        select id from public.rooms where home_id = ${homeB.homeId}
      `;

      await expect(
        sql`
          insert into public.visit_rooms (visit_id, room_id, home_id, stay)
          values (
            ${visit!.id}, ${otherRoom!.id}, ${homeA.homeId},
            daterange('2026-10-02', '2026-10-04', '[)')
          )
        `,
      ).rejects.toMatchObject({ code: "23503" });
    } finally {
      await sql`delete from public.homes where id in (${homeA.homeId}, ${homeB.homeId})`;
    }
  });
});

async function seedHome(name: string) {
  const [home] = await sql<{ id: string }[]>`
    insert into public.homes (name, timezone) values (${name}, 'Europe/Madrid')
    returning id
  `;
  const [host] = await sql<{ id: string }[]>`
    insert into public.hosts (home_id, display_name, locale)
    values (${home!.id}, 'Host', 'en') returning id
  `;
  const [party] = await sql<{ id: string }[]>`
    insert into public.parties (home_id, family_name, locale, link_token)
    values (${home!.id}, 'Party', 'en', ${crypto.randomUUID()}) returning id
  `;
  const [invitation] = await sql<{ id: string }[]>`
    insert into public.invitations (home_id, host_id, party_id, raw_message)
    values (${home!.id}, ${host!.id}, ${party!.id}, 'Scoped') returning id
  `;
  await sql`
    insert into public.rooms (home_id, name, beds)
    values (${home!.id}, 'Room', 2)
  `;
  return { homeId: home!.id, invitationId: invitation!.id };
}
