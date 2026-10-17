import { randomUUID } from "node:crypto";

import { test as base, type BrowserContext } from "@playwright/test";
import postgres, { type Sql } from "postgres";

import {
  createFixtureHousehold,
  type FixtureHousehold,
  type FixtureHouseholdOptions,
} from "../../../src/test-support/fixture-household";
import { signInAsHost } from "../../../src/test-support/host-session";

export type HouseholdOptions = Partial<
  Omit<FixtureHouseholdOptions, "tokenSecret" | "deleteBoundAuthUsers">
>;

export interface OpenHousehold extends FixtureHousehold {
  db: Sql;
  /** Signs the first fixture host in through local Supabase Auth. */
  signIn(
    context: Pick<BrowserContext, "addCookies">,
  ): Promise<{ userId: string; email: string }>;
  close(): Promise<void>;
}

/** Opens one disposable household; the caller closes it. */
export async function openHousehold(
  options: HouseholdOptions = {},
): Promise<OpenHousehold> {
  const databaseUrl = process.env.DATABASE_URL;
  const tokenSecret = process.env.LINK_TOKEN_SECRET;
  if (!databaseUrl || !tokenSecret) {
    throw new Error("E2E database settings are missing");
  }
  const db = postgres(databaseUrl, { prepare: false, max: 2 });
  let household: FixtureHousehold;
  try {
    household = await createFixtureHousehold(db, {
      label: `E2E household ${randomUUID()}`,
      ...options,
      tokenSecret,
      deleteBoundAuthUsers: true,
    });
  } catch (error) {
    await db.end({ timeout: 5 });
    throw error;
  }
  return {
    ...household,
    db,
    async signIn(context) {
      return signInAsHost(context, { sql: db, hostId: household.hostIds[0]! });
    },
    async close() {
      try {
        await household.cleanup();
      } finally {
        await db.end({ timeout: 5 });
      }
    },
  };
}

/** Playwright `test` with a per-test household that is always removed. */
export const test = base.extend<{
  householdOptions: HouseholdOptions;
  household: OpenHousehold;
}>({
  householdOptions: [{}, { option: true }],
  household: async ({ householdOptions }, provide) => {
    const household = await openHousehold(householdOptions);
    try {
      await provide(household);
    } finally {
      await household.close();
    }
  },
});
