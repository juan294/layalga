import "@/core/server-only";

import { createHmac, randomBytes } from "node:crypto";

const TOKEN_DOMAIN = "calendar-feed:v1";

export interface IssuedCalendarFeedToken {
  token: string;
  tokenHash: Uint8Array;
}

export function hashCalendarFeedToken(
  token: string,
  secret: string,
): Uint8Array {
  validateSecret(secret);
  if (!token) throw new Error("Calendar feed token is required");
  return createHmac("sha256", secret)
    .update(`${TOKEN_DOMAIN}:${token}`, "utf8")
    .digest();
}

export function issueCalendarFeedToken(
  secret: string,
): IssuedCalendarFeedToken {
  validateSecret(secret);
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashCalendarFeedToken(token, secret) };
}

function validateSecret(secret: string): void {
  if (Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("CALENDAR_FEED_SECRET must contain at least 32 bytes");
  }
}
