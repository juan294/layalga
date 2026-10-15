import { randomUUID } from "node:crypto";

import type { BrowserContext } from "@playwright/test";
import postgres, { type Sql } from "postgres";

import {
  createFixtureHousehold,
  type FixtureHousehold,
  type FixtureHouseholdOptions,
} from "../../../src/test-support/fixture-household";
import { signInAsHost } from "./host-session";

export interface OpenHousehold {
  db: Sql;
  household: FixtureHousehold;
  /** Signs the first fixture host in through local Supabase Auth. */
  signIn(context: Pick<BrowserContext, "addCookies">): Promise<void>;
  close(): Promise<void>;
}

/** One disposable household per test, removed in the matching after hook. */
export async function openHousehold(
  options: Partial<Omit<FixtureHouseholdOptions, "tokenSecret">> = {},
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
    });
  } catch (error) {
    await db.end({ timeout: 5 });
    throw error;
  }
  return {
    db,
    household,
    async signIn(context) {
      await signInAsHost(context, { sql: db, hostId: household.hostIds[0]! });
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

export function partyToken(household: FixtureHousehold, familyName: string) {
  const party = household.parties.find(
    (candidate) => candidate.familyName === familyName,
  );
  if (!party) throw new Error(`Fixture party is missing: ${familyName}`);
  return party.token;
}
