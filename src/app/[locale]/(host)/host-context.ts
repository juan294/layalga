import "@/core/server-only";

import { cache } from "react";

import type { AppLocale } from "@/i18n/routing";
import { getDatabaseConnection, sqlClient } from "@/core/db/client";
import { requireHost, type HostRecord } from "@/lib/auth/current-host";

export interface HostContext {
  host: HostRecord;
  locale: AppLocale;
  timeZone: string;
  /** ISO instant of the home's enabled demo clock, or null outside demo mode. */
  demoNow: string | null;
}

/**
 * Every host route (the Today overview and its five sub-pages) starts from
 * the same authenticated host, household timezone and demo-clock reading.
 * Wrapped in React's cache() so the (host) layout and a page rendered under
 * it share one query per request instead of two.
 */
export const loadHostContext = cache(
  async (locale: string): Promise<HostContext> => {
    const safeLocale: AppLocale = locale === "es" ? "es" : "en";
    const host = await requireHost(safeLocale);
    const sql = sqlClient(getDatabaseConnection().db);
    const [clockRow] = await sql<
      { now: Date | string | null; timezone: string }[]
    >`
      select dc.now, h.timezone
      from public.homes h
      left join public.demo_clock dc
        on dc.home_id = h.id and dc.enabled and h.demo
      where h.id = ${host.homeId}
    `;
    return {
      host,
      locale: safeLocale,
      timeZone: clockRow?.timezone ?? "UTC",
      demoNow: clockRow?.now ? new Date(clockRow.now).toISOString() : null,
    };
  },
);
