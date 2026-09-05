import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import { FakeClock } from "../clock";
import { confirmVisit, createTemporaryHold, BookingPolicyError } from "../booking/holds";
import {
  HouseholdPolicyNotFoundError,
  PolicyVersionConflictError,
  loadHouseholdPolicy,
  updateHouseholdPolicy,
} from "./settings";

const db = postgres(process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54622/postgres", { prepare: false, max: 5 });
afterAll(() => db.end({ timeout: 5 }));

async function fixture() {
  const homeId = randomUUID(), hostId = randomUUID();
  await db`insert into public.homes (id, name, timezone) values (${homeId}, ${homeId}, 'Europe/Madrid')`;
  await db`insert into public.hosts (id, home_id, display_name, locale) values (${hostId}, ${homeId}, 'Host', 'en')`;
  return { homeId, hostId };
}

const initial = { petsTogetherAllowed: false, maxFamiliesWithChildren: 1, version: 1 };

describe("host household policy", () => {
  it("authorizes the host's home, versions actual changes and audits before/after", async () => {
    const f = await fixture();
    try {
      expect(await loadHouseholdPolicy(db, f.homeId, f.hostId)).toEqual(initial);
      await expect(loadHouseholdPolicy(db, f.homeId, randomUUID())).rejects.toBeInstanceOf(HouseholdPolicyNotFoundError);
      await expect(updateHouseholdPolicy(db, { ...f, hostId: randomUUID(), expectedVersion: 1, petsTogetherAllowed: true, maxFamiliesWithChildren: 2 })).rejects.toBeInstanceOf(HouseholdPolicyNotFoundError);
      expect(await updateHouseholdPolicy(db, { ...f, expectedVersion: 1, petsTogetherAllowed: false, maxFamiliesWithChildren: 1 })).toEqual(initial);
      expect(await updateHouseholdPolicy(db, { ...f, expectedVersion: 1, petsTogetherAllowed: true, maxFamiliesWithChildren: 2 })).toEqual({ petsTogetherAllowed: true, maxFamiliesWithChildren: 2, version: 2 });
      await expect(updateHouseholdPolicy(db, { ...f, expectedVersion: 1, petsTogetherAllowed: false, maxFamiliesWithChildren: 1 })).rejects.toBeInstanceOf(PolicyVersionConflictError);
      const rows = await db<{ payload: unknown }[]>`select payload from public.audit_events where home_id = ${f.homeId} and kind = 'household_policy_updated'`;
      expect(rows).toHaveLength(1);
      expect(rows[0]?.payload).toEqual({ hostId: f.hostId, before: initial, after: { petsTogetherAllowed: true, maxFamiliesWithChildren: 2, version: 2 } });
    } finally { await db`delete from public.homes where id = ${f.homeId}`; }
  });

  it("allows exactly one concurrent change from the same policy version", async () => {
    const f = await fixture();
    try {
      const results = await Promise.allSettled([
        updateHouseholdPolicy(db, { ...f, expectedVersion: 1, petsTogetherAllowed: true, maxFamiliesWithChildren: 1 }),
        updateHouseholdPolicy(db, { ...f, expectedVersion: 1, petsTogetherAllowed: false, maxFamiliesWithChildren: 2 }),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const rejected = results.find((r) => r.status === "rejected");
      expect(rejected?.status === "rejected" && rejected.reason).toBeInstanceOf(PolicyVersionConflictError);
      expect((await loadHouseholdPolicy(db, f.homeId, f.hostId)).version).toBe(2);
    } finally { await db`delete from public.homes where id = ${f.homeId}`; }
  });

  it("waits for the same home advisory lock used by booking", async () => {
    const f = await fixture();
    const applicationName = `policy-lock-${randomUUID()}`;
    const contender = postgres(process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54622/postgres", {
      prepare: false,
      max: 1,
      connection: { application_name: applicationName },
    });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let locked!: () => void;
    const acquired = new Promise<void>((resolve) => { locked = resolve; });
    const blocker = db.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtextextended(${f.homeId}::text, 0))`;
      locked();
      await gate;
    });
    await acquired;
    const change = updateHouseholdPolicy(contender, {
      ...f, expectedVersion: 1, petsTogetherAllowed: true, maxFamiliesWithChildren: 1,
    });
    try {
      let waiting = false;
      const deadline = Date.now() + 2_000;
      while (!waiting && Date.now() < deadline) {
        const [row] = await db<{ waiting: boolean }[]>`
          select exists (
            select 1 from pg_stat_activity activity
            join pg_locks lock on lock.pid = activity.pid
            where activity.application_name = ${applicationName}
              and lock.locktype = 'advisory' and not lock.granted
          ) as waiting
        `;
        waiting = row?.waiting ?? false;
      }
      expect(waiting).toBe(true);
    } finally {
      release();
      await blocker;
      await change;
      await contender.end({ timeout: 5 });
      await db`delete from public.homes where id = ${f.homeId}`;
    }
  });

  it.each(["pets", "children"] as const)("rechecks %s policy before confirming an already approved hold", async (reason) => {
    const f = await fixture();
    const clock = new FakeClock(new Date("2026-09-01T10:00:00Z"));
    try {
      await updateHouseholdPolicy(db, { ...f, expectedVersion: 1, petsTogetherAllowed: true, maxFamiliesWithChildren: 2 });
      for (const name of ["One", "Two"]) {
        await db`insert into public.rooms (home_id, name, beds, guest_label, floor_label, sleeping_arrangement, maximum_capacity, inventory_state) values (${f.homeId}, ${name}, 4, ${name}, 'Ground', 'Beds', 4, 'available')`;
      }
      const visits: string[] = [];
      for (const name of ["First", "Second"]) {
        const partyId = randomUUID(), invitationId = randomUUID();
        await db`insert into public.parties (id, home_id, family_name, locale) values (${partyId}, ${f.homeId}, ${name}, 'en')`;
        await db`insert into public.invitations (id, home_id, host_id, party_id, raw_message) values (${invitationId}, ${f.homeId}, ${f.hostId}, ${partyId}, 'Visit')`;
        const visit = await createTemporaryHold(db, clock, { invitationId, stay: ["2026-10-02", "2026-10-04"], adults: 2, children: 1, pets: 1, approvedBy: f.hostId });
        visits.push(visit.visitId);
        if (name === "First") await confirmVisit(db, clock, visit.visitId, f.hostId);
      }
      await updateHouseholdPolicy(db, { ...f, expectedVersion: 2, petsTogetherAllowed: reason !== "pets", maxFamiliesWithChildren: reason === "children" ? 1 : 2 });
      await expect(confirmVisit(db, clock, visits[1]!, f.hostId)).rejects.toMatchObject({
        name: BookingPolicyError.name,
        verdict: { decision: "deny", reason },
      });
      const rows = await db<{ id: string; status: string }[]>`select id, status from public.visits where home_id = ${f.homeId}`;
      expect(rows.find((v) => v.id === visits[0])?.status).toBe("confirmed");
      expect(rows.find((v) => v.id === visits[1])?.status).toBe("hold");
    } finally { await db`delete from public.homes where id = ${f.homeId}`; }
  });

  it("grants policy writes only to web runtime and preserves runtime reads", async () => {
    const roles = ["layalga_web_runtime", "layalga_agent_runtime", "anon", "authenticated", "service_role"];
    const columns = ["pets_together_allowed", "max_families_with_children", "policy_version"];
    const privileges = await db<{
      role_name: string;
      column_name: string;
      can_update: boolean;
      can_read: boolean;
    }[]>`
      select role_name, column_name,
        has_column_privilege(role_name, 'public.homes', column_name, 'UPDATE') as can_update,
        has_column_privilege(role_name, 'public.homes', column_name, 'SELECT') as can_read
      from unnest(${db.array(roles)}::text[]) role_name
      cross join unnest(${db.array(columns)}::text[]) column_name
    `;
    expect(privileges).toHaveLength(roles.length * columns.length);
    for (const privilege of privileges) {
      expect(privilege.can_update, `${privilege.role_name}.${privilege.column_name}`).toBe(privilege.role_name === "layalga_web_runtime");
      if (privilege.role_name !== "service_role") {
        expect(privilege.can_read, `${privilege.role_name}.${privilege.column_name}`).toBe(
          privilege.role_name === "layalga_web_runtime" || privilege.role_name === "layalga_agent_runtime",
        );
      }
    }
    // PUBLIC is an ACL pseudo-role rather than a pg_roles entry. Inspect both
    // table and column grants; a table grant would override column revocation.
    const [publicPrivileges] = await db<{ can_update: boolean; can_read: boolean }[]>`
      with grants as (
        select acl.grantee, acl.privilege_type
        from pg_class table_acl
        cross join lateral aclexplode(coalesce(table_acl.relacl, acldefault('r', table_acl.relowner))) acl
        where table_acl.oid = 'public.homes'::regclass
        union all
        select acl.grantee, acl.privilege_type
        from pg_attribute column_acl
        cross join lateral aclexplode(coalesce(column_acl.attacl, '{}'::aclitem[])) acl
        where column_acl.attrelid = 'public.homes'::regclass
          and column_acl.attname = any(${db.array(columns)}::text[])
      )
      select exists(select 1 from grants where grantee = 0 and privilege_type = 'UPDATE') as can_update,
        exists(select 1 from grants where grantee = 0 and privilege_type = 'SELECT') as can_read
    `;
    expect(publicPrivileges).toEqual({ can_update: false, can_read: false });
  });
});
