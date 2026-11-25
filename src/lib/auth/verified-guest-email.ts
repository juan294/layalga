/** Only use a user that Auth gave getSessionUser or the bearer resolver, never submitted metadata. */
export function verifiedGoogleGuestEmail(
  user: {
    email?: string;
    email_confirmed_at?: string;
    identities?: { provider: string }[];
    user_metadata?: unknown;
  } | null,
): string | null {
  return user?.email &&
    user.email_confirmed_at &&
    user.identities?.some((identity) => identity.provider === "google")
    ? user.email
    : null;
}
