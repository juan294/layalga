import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export const DEMO_HOST_COOKIE = "layalga_demo_host";
export const DEMO_HOST_MAX_AGE = 12 * 60 * 60;
export const DEMO_GUEST_COOKIE = "layalga_demo_guest";
export const DEMO_GUEST_MAX_AGE = 12 * 60 * 60;

interface DemoSessionOptions {
  now?: number;
  secret?: string;
  sessionId?: string;
}

export interface DemoSessionPayload {
  hostId: string;
  sessionId: string;
  expiresAt: number;
}

export interface DemoGuestSessionPayload {
  invitationId: string;
  sessionId: string;
  expiresAt: number;
}

export function createDemoHostCookie(
  hostId: string,
  options: DemoSessionOptions = {},
): string {
  const now = options.now ?? Date.now();
  const secret = validSecret(options.secret ?? process.env.DEMO_SESSION_SECRET);
  const payload = Buffer.from(
    JSON.stringify({
      hostId,
      sessionId: options.sessionId ?? randomUUID(),
      expiresAt: now + DEMO_HOST_MAX_AGE * 1_000,
    }),
  ).toString("base64url");

  return `v1.${payload}.${signature(payload, secret)}`;
}

export function readDemoHostCookie(
  token: string | undefined,
  options: DemoSessionOptions = {},
): string | null {
  return readDemoHostSession(token, options)?.hostId ?? null;
}

export function readDemoHostSession(
  token: string | undefined,
  options: DemoSessionOptions = {},
): DemoSessionPayload | null {
  if (!token) return null;

  const [version, encodedPayload, providedSignature, extra] = token.split(".");
  if (version !== "v1" || !encodedPayload || !providedSignature || extra)
    return null;

  try {
    const secret = validSecret(
      options.secret ?? process.env.DEMO_SESSION_SECRET,
    );
    const expected = Buffer.from(signature(encodedPayload, secret));
    const provided = Buffer.from(providedSignature);
    if (
      expected.length !== provided.length ||
      !timingSafeEqual(expected, provided)
    ) {
      return null;
    }

    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as Partial<DemoSessionPayload>;
    const now = options.now ?? Date.now();
    return typeof payload.hostId === "string" &&
      typeof payload.sessionId === "string" &&
      typeof payload.expiresAt === "number" &&
      payload.expiresAt > now
      ? {
          hostId: payload.hostId,
          sessionId: payload.sessionId,
          expiresAt: payload.expiresAt,
        }
      : null;
  } catch {
    return null;
  }
}

export function createDemoGuestCookie(
  invitationId: string,
  options: DemoSessionOptions = {},
): string {
  const now = options.now ?? Date.now();
  const secret = validSecret(options.secret ?? process.env.DEMO_SESSION_SECRET);
  const payload = Buffer.from(
    JSON.stringify({
      invitationId,
      sessionId: options.sessionId ?? randomUUID(),
      expiresAt: now + DEMO_GUEST_MAX_AGE * 1_000,
    }),
  ).toString("base64url");

  return `v1.${payload}.${signature(payload, secret)}`;
}

export function readDemoGuestCookie(
  token: string | undefined,
  options: DemoSessionOptions = {},
): string | null {
  return readDemoGuestSession(token, options)?.invitationId ?? null;
}

export function readDemoGuestSession(
  token: string | undefined,
  options: DemoSessionOptions = {},
): DemoGuestSessionPayload | null {
  if (!token) return null;

  const [version, encodedPayload, providedSignature, extra] = token.split(".");
  if (version !== "v1" || !encodedPayload || !providedSignature || extra)
    return null;

  try {
    const secret = validSecret(
      options.secret ?? process.env.DEMO_SESSION_SECRET,
    );
    const expected = Buffer.from(signature(encodedPayload, secret));
    const provided = Buffer.from(providedSignature);
    if (
      expected.length !== provided.length ||
      !timingSafeEqual(expected, provided)
    ) {
      return null;
    }

    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as Partial<DemoGuestSessionPayload>;
    const now = options.now ?? Date.now();
    return typeof payload.invitationId === "string" &&
      typeof payload.sessionId === "string" &&
      typeof payload.expiresAt === "number" &&
      payload.expiresAt > now
      ? {
          invitationId: payload.invitationId,
          sessionId: payload.sessionId,
          expiresAt: payload.expiresAt,
        }
      : null;
  } catch {
    return null;
  }
}

function signature(payload: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`v1.${payload}`)
    .digest("base64url");
}

function validSecret(secret: string | undefined): string {
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error("DEMO_SESSION_SECRET must contain at least 32 bytes");
  }
  return secret;
}
