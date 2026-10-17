import type { User } from "@supabase/supabase-js";

export interface AccountIdentity {
  email: string;
  /** A Google-hosted profile picture, or null when none is safe to load. */
  avatarUrl: string | null;
  /** First letter of the email, shown when there is no picture. */
  initial: string;
}

/** Google serves profile pictures from subdomains of this domain. */
export const GOOGLE_AVATAR_DOMAIN = "googleusercontent.com";

/**
 * Describes the signed-in account for display. Pass a user returned by
 * `auth.getUser()`, never submitted data. The picture comes only from the
 * provider-set `identity_data`; `user_metadata` is writable by the signed-in
 * user, so it can hold any URL and is never read here.
 */
export function toAccountIdentity(user: User | null): AccountIdentity | null {
  if (!user?.email || !user.email_confirmed_at) return null;

  const googleIdentity = user.identities?.find(
    (identity) => identity.provider === "google",
  );
  return {
    email: user.email,
    avatarUrl: googleAvatarUrl(googleIdentity?.identity_data?.picture),
    initial: Array.from(user.email.toUpperCase())[0]!,
  };
}

function googleAvatarUrl(picture: unknown): string | null {
  if (typeof picture !== "string") return null;
  if (!URL.canParse(picture)) return null;
  const url = new URL(picture);
  const allowed =
    url.protocol === "https:" &&
    url.hostname.endsWith(`.${GOOGLE_AVATAR_DOMAIN}`);
  return allowed ? url.href : null;
}
