import "@/core/server-only";

import { cache } from "react";

import type { AppLocale } from "@/i18n/routing";
import { getDatabaseConnection, sqlClient } from "@/core/db/client";
import { requireHost, type HostRecord } from "@/lib/auth/current-host";

export interface HostContext {
  host: HostRecord;
  locale: AppLocale;
  timeZone: string;
}

/**
 * Every host route (the Today overview and its five sub-pages) starts from
 * the same authenticated host and household timezone.
 * Wrapped in React's cache() so the (host) layout and a page rendered under
 * it share one query per request instead of two.
 */
export const loadHostContext = cache(
  async (locale: string): Promise<HostContext> => {
    const safeLocale: AppLocale = locale === "es" ? "es" : "en";
    const host = await requireHost(safeLocale);
    const sql = sqlClient(getDatabaseConnection().db);
    const [home] = await sql<{ timezone: string }[]>`
      select timezone from public.homes where id = ${host.homeId}
    `;
    return {
      host,
      locale: safeLocale,
      timeZone: home?.timezone ?? "UTC",
    };
  },
);
