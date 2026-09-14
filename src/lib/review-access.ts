import { randomUUID } from "node:crypto";

import type { Sql } from "postgres";
import type { NextRequest } from "next/server";

import type { AppLocale } from "@/i18n/routing";

export const AUTOMATED_REVIEW_ACCESS_HEADER = "x-layalga-automated-review";

export type ReviewAccessMode = "guest" | "host";

export async function startReviewSession(
  sql: Sql,
  request: NextRequest,
  event: {
    accessMode: ReviewAccessMode;
    locale: AppLocale;
  },
): Promise<string> {
  const sessionId = randomUUID();
  if (request.headers.get(AUTOMATED_REVIEW_ACCESS_HEADER) !== "1") {
    await sql`
      insert into private.review_access_events (
        session_id,
        access_mode,
        locale
      ) values (
        ${sessionId},
        ${event.accessMode},
        ${event.locale}
      )
    `;
  }
  return sessionId;
}
