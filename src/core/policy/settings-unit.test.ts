import { describe, expect, it, vi } from "vitest";

import type { DatabaseClient } from "../db/client";
import {
  HouseholdPolicyNotFoundError,
  PolicyVersionConflictError,
  loadHouseholdPolicy,
  updateHouseholdPolicy,
} from "./settings";

const homeId = "11111111-1111-4111-8111-111111111111";
const hostId = "22222222-2222-4222-8222-222222222222";
const row = {
  pets_together_allowed: false,
  max_families_with_children: 1,
  policy_version: 1,
};

function fakeDatabase(options: {
  initial?: typeof row;
  updated?: typeof row;
  loadRow?: typeof row;
}) {
  const transaction = vi.fn(async (strings: TemplateStringsArray) => {
    const query = strings.join(" ");
    if (query.includes("select pg_advisory_xact_lock")) return [];
    if (query.includes("select home.pets_together_allowed")) {
      return options.initial ? [options.initial] : [];
    }
    if (query.includes("update public.homes")) {
      return options.updated ? [options.updated] : [];
    }
    return [];
  });
  const database = vi.fn(async () =>
    options.loadRow ? [options.loadRow] : [],
  );
  Object.assign(database, {
    begin: vi.fn(async (callback: (tx: typeof transaction) => unknown) =>
      callback(transaction),
    ),
  });
  return { database: database as unknown as DatabaseClient, transaction };
}

const input = {
  homeId,
  hostId,
  expectedVersion: 1,
  petsTogetherAllowed: false,
  maxFamiliesWithChildren: 1,
};

describe("household policy unit boundaries", () => {
  it("maps an authorized row and rejects a missing row", async () => {
    const found = fakeDatabase({ loadRow: row });
    await expect(loadHouseholdPolicy(found.database, homeId, hostId)).resolves.toEqual({
      petsTogetherAllowed: false,
      maxFamiliesWithChildren: 1,
      version: 1,
    });

    const missing = fakeDatabase({});
    await expect(loadHouseholdPolicy(missing.database, homeId, hostId)).rejects.toBeInstanceOf(
      HouseholdPolicyNotFoundError,
    );
  });

  it("returns unchanged settings without writing", async () => {
    const fake = fakeDatabase({ initial: row });

    await expect(updateHouseholdPolicy(fake.database, input)).resolves.toEqual({
      petsTogetherAllowed: false,
      maxFamiliesWithChildren: 1,
      version: 1,
    });
    expect(fake.transaction).toHaveBeenCalledTimes(2);
  });

  it("updates and audits changed settings", async () => {
    const fake = fakeDatabase({
      initial: row,
      updated: {
        pets_together_allowed: true,
        max_families_with_children: 2,
        policy_version: 2,
      },
    });

    await expect(
      updateHouseholdPolicy(fake.database, {
        ...input,
        petsTogetherAllowed: true,
        maxFamiliesWithChildren: 2,
      }),
    ).resolves.toEqual({ petsTogetherAllowed: true, maxFamiliesWithChildren: 2, version: 2 });
    expect(fake.transaction).toHaveBeenCalledTimes(4);
  });

  it("rejects missing rows, stale versions, and a failed update", async () => {
    const missing = fakeDatabase({});
    await expect(updateHouseholdPolicy(missing.database, input)).rejects.toBeInstanceOf(
      HouseholdPolicyNotFoundError,
    );

    const stale = fakeDatabase({ initial: row });
    await expect(
      updateHouseholdPolicy(stale.database, { ...input, expectedVersion: 2 }),
    ).rejects.toBeInstanceOf(PolicyVersionConflictError);

    const failed = fakeDatabase({ initial: row, updated: undefined });
    await expect(
      updateHouseholdPolicy(failed.database, { ...input, petsTogetherAllowed: true }),
    ).rejects.toBeInstanceOf(HouseholdPolicyNotFoundError);
  });

  it("validates the settings input before opening a transaction", async () => {
    const fake = fakeDatabase({ initial: row });
    await expect(
      updateHouseholdPolicy(fake.database, { ...input, expectedVersion: 0 }),
    ).rejects.toThrow();
    expect(fake.transaction).not.toHaveBeenCalled();
  });
});
