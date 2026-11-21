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

function key(browser: string) {
  const secret = process.env.LINK_TOKEN_SECRET;
  if (!secret) throw new Error("LINK_TOKEN_SECRET is required");
  return createHmac("sha256", secret)
    .update("layalga/stay-draft/v1/")
    .update(browser)
    .digest();
}

/** The tab carries ciphertext. The other half of the key stays in an HttpOnly cookie. */
export function sealStayDraft(
  input: StayRequestInput,
  browser: string,
  now = Date.now(),
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(browser), iv);
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
  browser?: string,
  now = Date.now(),
): StayRequestInput | null {
  if (!browser || typeof token !== "string" || token.length > 32_000)
    return null;
  const packed = Buffer.from(token, "base64url");
  if (packed.length <= 28) return null;
  const secret = key(browser);
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
