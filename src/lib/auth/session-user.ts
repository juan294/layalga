import "@/core/server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";

/**
 * The verified user of a direct web sign-in. Supabase `getUser()` also accepts
 * access tokens issued to connected OAuth clients, so a third-party client
 * could place its token in a session cookie. Those tokens carry `client_id`.
 */
export async function getSessionUser(
  supabase: Pick<SupabaseClient, "auth">,
): Promise<User | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims || claims.sub !== user.id || "client_id" in claims) return null;
  return [claims.aud].flat().includes("authenticated") ? user : null;
}
