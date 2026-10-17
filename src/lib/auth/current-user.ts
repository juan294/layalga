import "server-only";

import type { User } from "@supabase/supabase-js";
import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

import { toAccountIdentity, type AccountIdentity } from "./account-identity";

/**
 * The verified Supabase Auth user, looked up once per rendered request. Only
 * server components and the helpers they call may use it: route handlers and
 * server actions need their own fresh `auth.getUser()`.
 */
export const getAuthUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export async function getCurrentAccount(): Promise<AccountIdentity | null> {
  return toAccountIdentity(await getAuthUser());
}
