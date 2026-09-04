import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import { FakeClock } from "@/core/clock";

import { NoopScheduler } from "./deps";
import { memoryStoresForTask } from "./memory";
import { matchedPartyIdForCapture, runAgentTask } from "./run-task";
import { ScriptedModel } from "./scripted-model";

const url =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54622/postgres";
const sql = postgres(url, { prepare: false });

describe("agent task authority", () => {
  afterAll(() => sql.end());

  it("uses stored invitation requests even when the model omits them", async () => {
    const fixture = await seedHome("Stored requests");
    try {
      await sql`
        update public.invitations
        set structured = ${JSON.stringify({
          specialRequests: ["wheelchair access"],
        })}::text::jsonb
        where id = ${fixture.invitationId}
      `;
      const result = await runAgentTask(
        guestSubmit(fixture),
        agentDeps(
          new ScriptedModel([
            {
              toolUse: {
                name: "create_temporary_hold",
                input: holdInput(fixture, { specialRequests: [] }),
              },
            },
            { text: "Hold created." },
          ]),
        ),
      );

      expect(result.status).toBe("interrupted");
      expect(result.pendingDecisionIds).toHaveLength(1);
      expect(
        await sql`
          select id from public.visits
          where invitation_id = ${fixture.invitationId}
        `,
      ).toHaveLength(0);
    } finally {
      await cleanup(fixture);
    }
  });

  it("removes a model-authored approval from an allowed hold", async () => {
    const fixture = await seedHome("Forged approval");
    try {
      const result = await runAgentTask(
        guestSubmit(fixture),
        agentDeps(
          new ScriptedModel([
            {
              toolUse: {
                name: "create_temporary_hold",
                input: holdInput(fixture, { approvedBy: fixture.hostId }),
              },
            },
            { text: "Hold created." },
          ]),
        ),
      );

      expect(result.status).toBe("completed");
      const [visit] = await sql<{ approval_stay_hash: string | null }[]>`
        select approval_stay_hash from public.visits
        where invitation_id = ${fixture.invitationId}
      `;
      expect(visit?.approval_stay_hash).toBeNull();
    } finally {
      await cleanup(fixture);
    }
  });

  it("persists validated guest values instead of model-retyped values", async () => {
    const fixture = await seedHome("Canonical guest input", 6);
    try {
      const result = await runAgentTask(
        guestSubmit(fixture, {
          stay: ["2026-10-02", "2026-10-05"],
          adults: 2,
          children: 1,
          pets: 1,
          notes: "cot near the window",
        }),
        agentDeps(
          new ScriptedModel([
            {
              toolUse: {
                name: "create_temporary_hold",
                input: holdInput(fixture, {
                  stay: ["2026-11-10", "2026-11-11"],
                  adults: 5,
                  children: 0,
                  pets: 0,
                  specialRequests: [],
                }),
              },
            },
            { text: "Hold created." },
          ]),
        ),
      );

      expect(result.status).toBe("interrupted");
      const [decision] = await sql<{ reason: { decision: string } }[]>`
        select reason from public.pending_decisions where run_id = ${result.runId}
      `;
      expect(decision?.reason).toMatchObject({ decision: "interrupt" });

      const [pending] = await sql<{ id: string; interrupt_id: string }[]>`
        select id, interrupt_id from public.pending_decisions
        where run_id = ${result.runId}
      `;
      await sql`
        update public.invitations
        set structured = ${JSON.stringify({
          specialRequests: ["request added after the decision"],
        })}::text::jsonb
        where id = ${fixture.invitationId}
      `;
      await sql`
        update public.pending_decisions
        set status = 'approved', decided_by_host_id = ${fixture.hostId},
          decided_at = '2026-09-01T10:00:00Z'
        where id = ${pending!.id}
      `;
      const resumed = await runAgentTask(
        {
          task: "resume",
          homeId: fixture.homeId,
          sessionId: result.sessionId,
          responses: [
            {
              interruptId: pending!.interrupt_id,
              response: { approved: true, hostId: fixture.hostId },
            },
          ],
        },
        agentDeps(new ScriptedModel([{ text: "Hold created." }])),
      );
      expect(resumed.status).toBe("completed");

      const [visit] = await sql<
        {
          stay_start: string;
          stay_end: string;
          adults: number;
          children: number;
          pets: number;
          special_requests: string[];
        }[]
      >`
        select lower(stay)::text as stay_start, upper(stay)::text as stay_end,
          adults, children, pets, special_requests
        from public.visits where invitation_id = ${fixture.invitationId}
      `;
      expect(visit).toEqual({
        stay_start: "2026-10-02",
        stay_end: "2026-10-05",
        adults: 2,
        children: 1,
        pets: 1,
        special_requests: ["cot near the window"],
      });
    } finally {
      await cleanup(fixture);
    }
  });

  it("uses trusted guest room selection instead of model-authored room authority", async () => {
    const fixture = await seedHome("Trusted room selection");
    const [otherRoom] = await sql<{ id: string }[]>`
      insert into public.rooms (
        home_id, name, beds, guest_label, floor_label, sleeping_arrangement,
        maximum_capacity, inventory_state
      ) values (
        ${fixture.homeId}, 'Other room', 2, 'Other room', 'Upper',
        'Double bed', 2, 'available'
      ) returning id
    `;
    try {
      const result = await runAgentTask(
        guestSubmit(fixture, {
          roomIds: [fixture.roomId],
          overflowConsent: false,
        }),
        agentDeps(
          new ScriptedModel([
            {
              toolUse: {
                name: "create_temporary_hold",
                input: holdInput(fixture, {
                  roomIds: [otherRoom!.id],
                  overflowConsent: true,
                }),
              },
            },
            { text: "Hold created." },
          ]),
        ),
      );

      expect(result.status).toBe("completed");
      const rooms = await sql<{ room_id: string }[]>`
        select occupancy.room_id
        from public.visit_rooms occupancy
        join public.visits visit on visit.id = occupancy.visit_id
        where visit.invitation_id = ${fixture.invitationId}
      `;
      expect(rooms).toEqual([{ room_id: fixture.roomId }]);
    } finally {
      await cleanup(fixture);
    }
  });

  it("prepares one home-scoped room proposal per host request without applying it", async () => {
    const fixture = await seedHome("Room proposal");
    const task = {
      task: "host_room_request" as const,
      homeId: fixture.homeId,
      hostId: fixture.hostId,
      rawMessage: "Close Room from 2026-10-02 to 2026-10-04.",
      locale: "en" as const,
    };
    const model = () =>
      new ScriptedModel([
        {
          toolUse: {
            name: "prepare_room_action",
            input: {
              kind: "close",
              stay: ["2026-10-02", "2026-10-04"],
              roomIds: [fixture.roomId],
              summary: "Room unavailable",
            },
          },
        },
        {
          toolUse: {
            name: "prepare_room_action",
            input: {
              kind: "close",
              stay: ["2026-10-02", "2026-10-04"],
              roomIds: [fixture.roomId],
              summary: "Room unavailable",
            },
          },
        },
        { text: "Proposal ready for host confirmation." },
      ]);
    try {
      const first = await runAgentTask(task, agentDeps(model()));
      const replay = await runAgentTask(task, agentDeps(model()));

      expect(first.status).toBe("completed");
      expect(replay.runId).toBe(first.runId);
      const proposals = await sql<
        { id: string; status: string; run_id: string; room_id: string }[]
      >`
        select proposal.id, proposal.status, proposal.run_id, link.room_id
        from public.room_action_proposals proposal
        join public.room_action_proposal_rooms link
          on link.proposal_id = proposal.id
        where proposal.home_id = ${fixture.homeId}
      `;
      expect(proposals).toEqual([
        expect.objectContaining({
          status: "pending",
          run_id: first.runId,
          room_id: fixture.roomId,
        }),
      ]);
      expect(
        await sql`
          select id from public.private_room_blocks
          where home_id = ${fixture.homeId}
        `,
      ).toHaveLength(0);
      expect(
        await sql`
          select id from public.room_availability_overrides
          where home_id = ${fixture.homeId}
        `,
      ).toHaveLength(0);
    } finally {
      await cleanup(fixture);
      await sql`delete from public.agent_sessions where session_id = ${`room_${fixture.hostId}`}`;
    }
  });

  it("does not prepare a host proposal that names a room in another home", async () => {
    const [homeA, homeB] = await Promise.all([
      seedHome("Proposal A"),
      seedHome("Proposal B"),
    ]);
    try {
      const result = await runAgentTask(
        {
          task: "host_room_request",
          homeId: homeA.homeId,
          hostId: homeA.hostId,
          rawMessage: "Close a room.",
          locale: "en",
        },
        agentDeps(
          new ScriptedModel([
            {
              toolUse: {
                name: "prepare_room_action",
                input: {
                  kind: "close",
                  stay: ["2026-10-02", "2026-10-04"],
                  roomIds: [homeB.roomId],
                  summary: "Unavailable",
                },
              },
            },
            { text: "The room proposal could not be prepared." },
          ]),
        ),
      );
      expect(result.status).toBe("completed");
      expect(
        await sql`
          select id from public.room_action_proposals
          where home_id in (${homeA.homeId}, ${homeB.homeId})
        `,
      ).toHaveLength(0);
    } finally {
      await sql`delete from public.homes where id in (${homeA.homeId}, ${homeB.homeId})`;
      await sql`delete from public.agent_sessions where session_id = ${`room_${homeA.hostId}`}`;
    }
  });

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

  it("only matches an existing party's family name within its own home (A7)", async () => {
    const [homeA, homeB] = await Promise.all([
      seedHome("Memory scope A"),
      seedHome("Memory scope B"),
    ]);
    try {
      await sql`
        update public.parties set family_name = 'Familia Vega' where id in (
          select party_id from public.invitations where id = ${homeA.invitationId}
        )
      `;
      await sql`
        update public.parties set family_name = 'The Oteros' where id in (
          select party_id from public.invitations where id = ${homeB.invitationId}
        )
      `;
      const [vegaPartyId] = await sql<{ party_id: string }[]>`
        select party_id from public.invitations where id = ${homeA.invitationId}
      `;

      // homeA's raw message names a party that only exists in homeB: no match.
      await expect(
        matchedPartyIdForCapture(
          sql,
          homeA.homeId,
          "Inviting the Oteros for a visit",
        ),
      ).resolves.toBeUndefined();

      // homeA's raw message names its own party: matches, scoped to homeA.
      await expect(
        matchedPartyIdForCapture(sql, homeA.homeId, "Oye, los Vega vienen"),
      ).resolves.toBe(vegaPartyId!.party_id);
    } finally {
      await sql`delete from public.homes where id in (${homeA.homeId}, ${homeB.homeId})`;
    }
  });

  it("never scopes a guest task's memory store to another party (A7)", async () => {
    const [homeA, homeB] = await Promise.all([
      seedHome("Store scope A"),
      seedHome("Store scope B"),
    ]);
    try {
      const [partyA] = await sql<{ party_id: string }[]>`
        select party_id from public.invitations where id = ${homeA.invitationId}
      `;
      const [partyB] = await sql<{ party_id: string }[]>`
        select party_id from public.invitations where id = ${homeB.invitationId}
      `;
      const config = {
        memory: "agentcore" as const,
        memoryId: "mem-test",
        awsRegion: "us-east-1",
      };
      const [storeA] = memoryStoresForTask(
        "guest_submit",
        { homeId: homeA.homeId, partyId: partyA!.party_id },
        "inv_1",
        config,
      );
      const [storeB] = memoryStoresForTask(
        "guest_submit",
        { homeId: homeB.homeId, partyId: partyB!.party_id },
        "inv_2",
        config,
      );
      const namespaceOf = (store: unknown) =>
        String((store as { resolvedNamespace: string }).resolvedNamespace);

      expect(namespaceOf(storeA)).toContain(partyA!.party_id);
      expect(namespaceOf(storeA)).not.toContain(partyB!.party_id);
      expect(namespaceOf(storeB)).toContain(partyB!.party_id);
      expect(namespaceOf(storeB)).not.toContain(partyA!.party_id);
      expect(namespaceOf(storeA)).not.toBe(namespaceOf(storeB));
    } finally {
      await sql`delete from public.homes where id in (${homeA.homeId}, ${homeB.homeId})`;
    }
  });
});

function guestSubmit(
  fixture: Awaited<ReturnType<typeof seedHome>>,
  overrides: Partial<{
    stay: [string, string];
    adults: number;
    children: number;
    pets: number;
    notes: string;
    roomIds: string[];
    overflowConsent: boolean;
  }> = {},
) {
  return {
    task: "guest_submit" as const,
    homeId: fixture.homeId,
    invitationId: fixture.invitationId,
    stay: ["2026-10-02", "2026-10-04"] as [string, string],
    adults: 2,
    children: 0,
    pets: 0,
    locale: "en" as const,
    ...overrides,
  };
}

function holdInput(
  fixture: Awaited<ReturnType<typeof seedHome>>,
  overrides: Record<string, unknown> = {},
) {
  return {
    invitationId: fixture.invitationId,
    stay: ["2026-10-02", "2026-10-04"],
    adults: 2,
    children: 0,
    pets: 0,
    specialRequests: [],
    ...overrides,
  };
}

function agentDeps(model: ScriptedModel) {
  return {
    db: sql,
    clock: new FakeClock(new Date("2026-09-01T10:00:00Z")),
    scheduler: new NoopScheduler(),
    appUrl: "http://localhost:3008",
    locale: "en" as const,
    model,
  };
}

async function cleanup(fixture: Awaited<ReturnType<typeof seedHome>>) {
  await sql`delete from public.homes where id = ${fixture.homeId}`;
  await sql`delete from public.agent_sessions where session_id = ${`inv_${fixture.invitationId}`}`;
}

async function seedHome(name: string, beds = 2) {
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
  const [room] = await sql<{ id: string }[]>`
    insert into public.rooms (
      home_id, name, beds, guest_label, floor_label, sleeping_arrangement,
      maximum_capacity, inventory_state
    ) values (${home!.id}, 'Room', ${beds}, 'Room', 'Ground', 'Beds', ${beds}, 'available')
    returning id
  `;
  return {
    homeId: home!.id,
    hostId: host!.id,
    invitationId: invitation!.id,
    roomId: room!.id,
  };
}
