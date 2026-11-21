import { verifiedGoogleGuestEmail } from "@/lib/auth/verified-guest-email";
import { createClient } from "@/lib/supabase/server";

export async function verifiedRequester() {
  const {
    data: { user },
  } = await (await createClient()).auth.getUser();
  const email = verifiedGoogleGuestEmail(user);
  return user && email ? { userId: user.id, email } : null;
}
