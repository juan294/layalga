import { createHmac } from "node:crypto";
export function hashLinkToken(token: string, secret: string): string {
  if (!token) throw new Error("Link token is required");
  if (!secret) throw new Error("LINK_TOKEN_SECRET is required");
  return createHmac("sha256", secret).update(token, "utf8").digest("hex");
}

export function deriveCaptureLink(
  secret: string,
  invitationId: string,
  generation: string,
) {
  if (!secret) throw new Error("LINK_TOKEN_SECRET is required");
  const token = createHmac("sha256", secret)
    .update(`layalga/invitation-link/v1/${invitationId}/${generation}`)
    .digest("base64url");
  return { token, hash: hashLinkToken(token, secret) };
}
