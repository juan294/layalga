import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createFixtureHousehold,
  type FixtureHousehold,
} from "@/test-support/fixture-household";

import { recordHostDecision } from "./host-decision";

const db = postgres(
  process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:54622/postgres",
  { max: 2, prepare: false },
);

describe("recordHostDecision", () => {
  let household: FixtureHousehold;
  let decisionId: string;

  beforeEach(async () => {
    household = await createFixtureHousehold(db, {
      label: `Decision ${randomUUID()}`,
      tokenSecret: "0123456789abcdef0123456789abcdef",
      hosts: 2,
      rooms: [],
      parties: [],
    });
    const [run] = await db<{ id: string }[]>`
      insert into public.runs (home_id, session_id, task, payload, status)
      values (${household.homeId}, 'inv_decision', 'guest_submit', '{}'::jsonb, 'interrupted')
      returning id
    `;
    const [decision] = await db<{ id: string }[]>`
      insert into public.pending_decisions (
        home_id, run_id, agent_session_id, interrupt_id, interrupt_name, reason
      ) values (
        ${household.homeId}, ${run!.id}, 'inv_decision', 'interrupt-1',
        'host_approval', '{}'::jsonb
      )
      returning id
    `;
    decisionId = decision!.id;
  });

  afterEach(async () => {
    await household.cleanup();
  });

  afterAll(async () => {
    await db.end({ timeout: 5 });
  });

  it("records the approval and returns the session to resume", async () => {
    const recorded = await recordHostDecision(db, {
      decisionId,
      homeId: household.homeId,
      hostId: household.hostIds[0]!,
      approved: true,
      note: "Welcome",
    });
    expect(recorded).toEqual({
      agentSessionId: "inv_decision",
      interruptId: "interrupt-1",
    });
    const [row] = await db<
      { status: string; decided_by_host_id: string; note: string }[]
    >`select status, decided_by_host_id, note from public.pending_decisions where id = ${decisionId}`;
    expect(row).toEqual({
      status: "approved",
      decided_by_host_id: household.hostIds[0],
      note: "Welcome",
    });
  });

  it("lets the same host retry an unapplied decision but not another host or home", async () => {
    const input = {
      decisionId,
      homeId: household.homeId,
      hostId: household.hostIds[0]!,
      approved: false,
    };
    expect(await recordHostDecision(db, input)).not.toBeNull();
    expect(await recordHostDecision(db, input)).not.toBeNull();
    expect(
      await recordHostDecision(db, { ...input, hostId: household.hostIds[1]! }),
    ).toBeNull();
    expect(
      await recordHostDecision(db, { ...input, approved: true }),
    ).toBeNull();
    expect(
      await recordHostDecision(db, { ...input, homeId: randomUUID() }),
    ).toBeNull();
  });
});
