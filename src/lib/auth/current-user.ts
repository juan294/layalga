import "server-only";

import type { User } from "@supabase/supabase-js";
import { cache } from "react";

import { getSessionUser } from "@/lib/auth/session-user";
import { createClient } from "@/lib/supabase/server";

import { toAccountIdentity, type AccountIdentity } from "./account-identity";

/**
 * The verified Supabase Auth user, looked up once per rendered request. Only
 * server components and the helpers they call may use it: route handlers and
 * server actions need their own fresh `getSessionUser()`.
 */
export const getAuthUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  return getSessionUser(supabase);
});

export async function getCurrentAccount(): Promise<AccountIdentity | null> {
  return toAccountIdentity(await getAuthUser());
}
