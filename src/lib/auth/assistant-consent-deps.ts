import "@/core/server-only";

import { getDatabaseConnection } from "@/core/db/client";
import { assistantAccessOn } from "@/lib/server/env";
import { createClient } from "@/lib/supabase/server";

import type { ConsentDeps } from "./assistant-consent";

/** The switch, the database and the caller's own cookie session. */
export async function consentDeps(): Promise<ConsentDeps> {
  return {
    enabled: assistantAccessOn(),
    database: getDatabaseConnection().db,
    supabase: await createClient(),
  };
}
