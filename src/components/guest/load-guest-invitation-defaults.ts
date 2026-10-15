import "server-only";

import { SystemClock } from "@/core/clock";
import { getDatabaseConnection } from "@/core/db/client";
import { guestInvitationDefaults } from "./guest-invitation-defaults";

/** The caller first resolves invitation access; homeId never comes from guest form data. */
export async function loadGuestInvitationDefaults(
  homeId: string,
  structured: Record<string, unknown>,
) {
  const connection = getDatabaseConnection();
  const [home] = await connection.sql<{ timezone: string }[]>`
    select timezone from public.homes where id=${homeId}
  `;
  if (!home) throw new Error("Invitation home unavailable");
  const now = new SystemClock().now();
  return {
    now: now.toISOString(),
    timeZone: home.timezone,
    defaults: guestInvitationDefaults(structured, {
      now,
      timeZone: home.timezone,
    }),
  };
}
