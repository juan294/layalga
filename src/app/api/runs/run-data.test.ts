import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentHost: vi.fn() }));

vi.mock("@/lib/auth/current-host", () => ({
  getCurrentHost: mocks.getCurrentHost,
}));

import { captureInvitation } from "@/core/booking/invitations";

import { getAuthorizedRunSnapshot } from "./run-data";

const connectionUrl =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54622/postgres";
const db = postgres(connectionUrl, { max: 2, prepare: false });
const TOKEN_SECRET = "run-timeline-test-secret";

interface SeededHome {
  homeId: string;
  hostId: string;
}

async function seedHome(suffix: string): Promise<SeededHome> {
  const [home] = await db<{ id: string }[]>`
    insert into public.homes (name, timezone)
    values (${`Run timeline ${suffix}`}, 'Europe/Madrid')
    returning id
  `;
  if (!home) throw new Error("Failed to seed run timeline home");
  const [host] = await db<{ id: string }[]>`
    insert into public.hosts (home_id, display_name, locale)
    values (${home.id}, 'Host', 'en')
    returning id
  `;
  if (!host) throw new Error("Failed to seed run timeline host");
  return { homeId: home.id, hostId: host.id };
}

async function seedRun(homeId: string, sessionId: string): Promise<string> {
  const [run] = await db<{ id: string }[]>`
    insert into public.runs (home_id, session_id, task, status)
    values (${homeId}, ${sessionId}, 'host_capture', 'completed')
    returning id
  `;
  if (!run) throw new Error("Failed to seed run");
  return run.id;
}

async function seedEvent(
  homeId: string,
  runId: string,
  kind: string,
  payload: Record<string, unknown>,
  createdAt: string,
): Promise<void> {
  await db`
    insert into public.audit_events (home_id, run_id, actor, kind, payload, created_at)
    values (
      ${homeId}, ${runId}, 'agent', ${kind},
      ${JSON.stringify(payload)}::text::jsonb, ${createdAt}
    )
  `;
}

function asHost(homeId: string, hostId: string) {
  mocks.getCurrentHost.mockResolvedValue({
    id: hostId,
    homeId,
    displayName: "Host",
    locale: "en",
    demo: false,
  });
}

describe("getAuthorizedRunSnapshot events", () => {
  afterAll(async () => {
    await db.end({ timeout: 5 });
  });

  beforeEach(() => {
    mocks.getCurrentHost.mockReset();
    mocks.getCurrentHost.mockResolvedValue(null);
  });

  it("orders events by time, scopes them to the run, and carries only kind/name/decision", async () => {
    const suffix = randomUUID();
    const { homeId, hostId } = await seedHome(suffix);
    const runId = await seedRun(homeId, `host_${suffix}`);
    const otherRunId = await seedRun(homeId, `host_other_${suffix}`);

    await seedEvent(
      homeId,
      runId,
      "policy_verdict",
      {
        tool: "create_temporary_hold",
        decision: "interrupt",
        reason: { note: "sensitive room detail" },
      },
      "2026-09-01T10:00:00.000Z",
    );
    await seedEvent(
      homeId,
      runId,
      "tool_call",
      { name: "capture_invitation", roomIds: [randomUUID()] },
      "2026-09-01T09:00:00.000Z",
    );
    await seedEvent(
      homeId,
      runId,
      "decision_applied",
      { pendingDecisionId: randomUUID(), runId },
      "2026-09-01T11:00:00.000Z",
    );
    await seedEvent(
      homeId,
      otherRunId,
      "tool_call",
      { name: "notify" },
      "2026-09-01T09:30:00.000Z",
    );

    asHost(homeId, hostId);
    const snapshot = await getAuthorizedRunSnapshot(runId);

    expect(snapshot).not.toBeNull();
    expect(snapshot?.events).toEqual([
      {
        at: "2026-09-01T09:00:00.000Z",
        kind: "tool_call",
        name: "capture_invitation",
      },
      {
        at: "2026-09-01T10:00:00.000Z",
        kind: "policy_verdict",
        decision: "interrupt",
      },
      { at: "2026-09-01T11:00:00.000Z", kind: "decision_applied" },
    ]);
    const serialized = JSON.stringify(snapshot?.events);
    expect(serialized).not.toContain("sensitive room detail");
    expect(serialized).not.toContain("reason");
    expect(serialized).not.toContain("roomIds");
  });

  it("returns an empty events array for a run with no audit rows", async () => {
    const suffix = randomUUID();
    const { homeId, hostId } = await seedHome(suffix);
    const runId = await seedRun(homeId, `host_${suffix}`);

    asHost(homeId, hostId);
    const snapshot = await getAuthorizedRunSnapshot(runId);

    expect(snapshot?.events).toEqual([]);
  });

  it("hides events from a guest token that does not own the run", async () => {
    const previousSecret = process.env.LINK_TOKEN_SECRET;
    process.env.LINK_TOKEN_SECRET = TOKEN_SECRET;
    try {
      const suffixA = randomUUID();
      const suffixB = randomUUID();
      const homeA = await seedHome(suffixA);
      const homeB = await seedHome(suffixB);

      const invitationA = await captureInvitation(db, {
        homeId: homeA.homeId,
        hostId: homeA.hostId,
        partyName: "Party A",
        partyLocale: "en",
        rawMessage: "Please come stay",
        tokenSecret: TOKEN_SECRET,
        appUrl: "https://example.test",
      });
      const invitationB = await captureInvitation(db, {
        homeId: homeB.homeId,
        hostId: homeB.hostId,
        partyName: "Party B",
        partyLocale: "en",
        rawMessage: "Please come stay",
        tokenSecret: TOKEN_SECRET,
        appUrl: "https://example.test",
      });

      const runIdA = await seedRun(
        homeA.homeId,
        `inv_${invitationA.invitationId}`,
      );
      await seedEvent(
        homeA.homeId,
        runIdA,
        "tool_call",
        { name: "capture_invitation" },
        "2026-09-01T09:00:00.000Z",
      );

      const tokenA = new URL(invitationA.guestLink).pathname.split("/").at(-1);
      const tokenB = new URL(invitationB.guestLink).pathname.split("/").at(-1);
      if (!tokenA || !tokenB) throw new Error("Missing guest token");

      const foreignAttempt = await getAuthorizedRunSnapshot(runIdA, tokenB);
      expect(foreignAttempt).toBeNull();

      const ownAttempt = await getAuthorizedRunSnapshot(runIdA, tokenA);
      expect(ownAttempt?.events).toEqual([
        {
          at: "2026-09-01T09:00:00.000Z",
          kind: "tool_call",
          name: "capture_invitation",
        },
      ]);
    } finally {
      if (previousSecret === undefined) delete process.env.LINK_TOKEN_SECRET;
      else process.env.LINK_TOKEN_SECRET = previousSecret;
    }
  });
});
