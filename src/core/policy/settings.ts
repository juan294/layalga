import { z } from "zod";

import { sqlClient, type DatabaseClient } from "../db/client";

export const householdPolicyInput = z.object({
  expectedVersion: z.number().int().min(1),
  petsTogetherAllowed: z.boolean(),
  maxFamiliesWithChildren: z.number().int().min(1).max(20),
});

export interface HouseholdPolicy {
  petsTogetherAllowed: boolean;
  maxFamiliesWithChildren: number;
  version: number;
}

interface PolicyRow {
  pets_together_allowed: boolean;
  max_families_with_children: number;
  policy_version: number;
}

export class HouseholdPolicyNotFoundError extends Error {
  constructor() {
    super("Household policy is unavailable to this host");
    this.name = "HouseholdPolicyNotFoundError";
  }
}

export class PolicyVersionConflictError extends Error {
  constructor() {
    super("Household policy changed. Review the latest settings before saving.");
    this.name = "PolicyVersionConflictError";
  }
}

/** Caller supplies the current authenticated host, never a submitted host ID. */
export async function loadHouseholdPolicy(
  database: DatabaseClient,
  homeId: string,
  hostId: string,
): Promise<HouseholdPolicy> {
  const sql = sqlClient(database);
  const [row] = await sql<PolicyRow[]>`
    select home.pets_together_allowed, home.max_families_with_children,
      home.policy_version
    from public.homes home
    join public.hosts host on host.home_id = home.id
    where home.id = ${homeId} and host.id = ${hostId}
  `;
  if (!row) throw new HouseholdPolicyNotFoundError();
  return fromRow(row);
}

/** Host-owned settings serialize with booking; existing stays are untouched. */
export async function updateHouseholdPolicy(
  database: DatabaseClient,
  input: z.infer<typeof householdPolicyInput> & { homeId: string; hostId: string },
): Promise<HouseholdPolicy> {
  const settings = householdPolicyInput.parse(input);
  const sql = sqlClient(database);
  return sql.begin(async (transaction) => {
    // Identical key to booking/room operations. Re-read after acquiring it so
    // queued booking approval and a policy save see a single ordered policy.
    await transaction`
      select pg_advisory_xact_lock(hashtextextended(${input.homeId}::text, 0))
    `;
    const [row] = await transaction<PolicyRow[]>`
      select home.pets_together_allowed, home.max_families_with_children,
        home.policy_version
      from public.homes home
      join public.hosts host on host.home_id = home.id
      where home.id = ${input.homeId} and host.id = ${input.hostId}
      for update of home
    `;
    if (!row) throw new HouseholdPolicyNotFoundError();
    const before = fromRow(row);
    if (before.version !== settings.expectedVersion) {
      throw new PolicyVersionConflictError();
    }
    if (
      before.petsTogetherAllowed === settings.petsTogetherAllowed &&
      before.maxFamiliesWithChildren === settings.maxFamiliesWithChildren
    ) {
      return before;
    }
    const [updated] = await transaction<PolicyRow[]>`
      update public.homes
      set pets_together_allowed = ${settings.petsTogetherAllowed},
        max_families_with_children = ${settings.maxFamiliesWithChildren},
        policy_version = policy_version + 1
      where id = ${input.homeId}
      returning pets_together_allowed, max_families_with_children, policy_version
    `;
    if (!updated) throw new HouseholdPolicyNotFoundError();
    const after = fromRow(updated);
    await transaction`
      insert into public.audit_events (home_id, actor, kind, payload)
      values (${input.homeId}, 'host', 'household_policy_updated',
        ${JSON.stringify({ hostId: input.hostId, before, after })}::text::jsonb)
    `;
    return after;
  });
}

function fromRow(row: PolicyRow): HouseholdPolicy {
  return {
    petsTogetherAllowed: row.pets_together_allowed,
    maxFamiliesWithChildren: row.max_families_with_children,
    version: row.policy_version,
  };
}
