import type { SessionLookup } from "./session-user";
import { verifiedGoogleGuestEmail } from "./verified-guest-email";

/** The signed-in guest, or the reason why there is none. */
export function googleGuest(session: SessionLookup) {
  if (session.status === "unavailable")
    return { status: "unavailable" } as const;
  const user = session.status === "signed_in" ? session.user : null;
  const email = verifiedGoogleGuestEmail(user);
  return user && email
    ? ({ status: "ok", userId: user.id, email } as const)
    : ({ status: "sign_in" } as const);
}
