import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import {
  HOST_ACCOUNT_CASES,
  withHostAccountCase,
} from "@/test-support/host-account-cases";
import { localAdmin, localSupabase } from "@/test-support/assistant-oauth";

import { isHostAccount } from "./host-account";

const db = postgres(localSupabase().databaseUrl, { max: 2, prepare: false });
const web = localAdmin("layalga_web_runtime");

afterAll(async () => {
  await db.end({ timeout: 5 });
  await web.end({ timeout: 5 });
});

describe("isHostAccount", () => {
  it.each(HOST_ACCOUNT_CASES)(
    "applies the host rule to $name",
    async (entry) => {
      await withHostAccountCase(db, entry, async ({ userId, email }) => {
        expect(await isHostAccount(web, userId, email)).toBe(entry.host);
        expect(await isHostAccount(web, userId, null)).toBe(
          entry.bound ?? false,
        );
      });
    },
  );
});
