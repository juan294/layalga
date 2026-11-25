import "server-only";

import type { User } from "@supabase/supabase-js";
import { cache } from "react";

import { lookUpSessionUser } from "@/lib/auth/session-user";
import { createClient } from "@/lib/supabase/server";

import { toAccountIdentity, type AccountIdentity } from "./account-identity";

/**
 * The verified Supabase Auth user, looked up once per rendered request. Only
 * server components and the helpers they call may use it: route handlers and
 * server actions need their own fresh `getSessionUser()`.
 */
export const lookUpAuthUser = cache(async () =>
  lookUpSessionUser(await createClient()),
);

export async function getAuthUser(): Promise<User | null> {
  const session = await lookUpAuthUser();
  return session.status === "signed_in" ? session.user : null;
}

export async function getCurrentAccount(): Promise<AccountIdentity | null> {
  return toAccountIdentity(await getAuthUser());
}
