/** Only use a user that Auth gave getSessionUser or the bearer resolver, never submitted metadata. */
export function verifiedGoogleGuestEmail(
  user: {
    email?: string | null;
    email_confirmed_at?: string | null;
    identities?: { provider: string }[] | null;
    user_metadata?: unknown;
  } | null,
): string | null {
  return user?.email &&
    user.email_confirmed_at &&
    user.identities?.some((identity) => identity.provider === "google")
    ? user.email
    : null;
}
