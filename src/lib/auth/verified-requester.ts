import { verifiedGoogleGuestEmail } from "@/lib/auth/verified-guest-email";
import { getSessionUser } from "@/lib/auth/session-user";
import { createClient } from "@/lib/supabase/server";

export async function verifiedRequester() {
  const user = await getSessionUser(await createClient());
  const email = verifiedGoogleGuestEmail(user);
  return user && email ? { userId: user.id, email } : null;
}
