import "server-only";

import { cookies } from "next/headers";
import { SystemClock } from "@/core/clock";
import { getDatabaseConnection } from "@/core/db/client";
import { resolveGuestReturnCapability } from "@/core/notifications/guest-contact";
import { DEMO_GUEST_COOKIE } from "./demo-session";

import { GUEST_EMAIL_COOKIE } from "./guest-email-cookie";
export { GUEST_EMAIL_COOKIE } from "./guest-email-cookie";

/** Exchange a valid capability for an httpOnly cookie; no booking or consent writes. */
export async function setGuestEmailSession(capability: string) {
  const authority = await resolveGuestReturnCapability(
    getDatabaseConnection().db,
    capability,
    new SystemClock(),
  );
  if (!authority) return null;
  const cookieStore = await cookies();
  cookieStore.delete(DEMO_GUEST_COOKIE);
  cookieStore.set(GUEST_EMAIL_COOKIE, capability, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(authority.expiresAt),
  });
  return authority;
}
