import "@/core/server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";
import type { StayRequestInput } from "@/core/booking/stay-requests";

export const DRAFT_SECONDS = 15 * 60;
export const DRAFT_BROWSER_COOKIE = "layalga_request_browser";

function key(browser: string, requesterId: string) {
  const secret = process.env.LINK_TOKEN_SECRET;
  if (!secret) throw new Error("LINK_TOKEN_SECRET is required");
  return createHmac("sha256", secret)
    .update("layalga/stay-draft/v2/")
    .update(JSON.stringify([browser, requesterId]))
    .digest();
}

/** The sealed tab draft can only be opened by its Google account in the same browser. */
export function sealStayDraft(
  input: StayRequestInput,
  browser: string,
  requesterId: string,
  now = Date.now(),
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(browser, requesterId), iv);
  const ciphertext = Buffer.concat([
    cipher.update(
      JSON.stringify({ input, expires: now + DRAFT_SECONDS * 1000 }),
      "utf8",
    ),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString(
    "base64url",
  );
}

export function readStayDraft(
  token: unknown,
  browser: string | undefined,
  requesterId: string,
  now = Date.now(),
): StayRequestInput | null {
  if (!browser || typeof token !== "string" || token.length > 32_000)
    return null;
  const packed = Buffer.from(token, "base64url");
  if (packed.length <= 28) return null;
  const secret = key(browser, requesterId);
  try {
    const cipher = createDecipheriv(
      "aes-256-gcm",
      secret,
      packed.subarray(0, 12),
    );
    cipher.setAuthTag(packed.subarray(12, 28));
    const result = JSON.parse(
      Buffer.concat([
        cipher.update(packed.subarray(28)),
        cipher.final(),
      ]).toString("utf8"),
    );
    return result.expires > now ? result.input : null;
  } catch {
    return null;
  }
}
