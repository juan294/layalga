import { timingSafeEqual } from "node:crypto";

export const MIN_INTERNAL_SECRET_BYTES = 32;

export function matchesInternalSecret(
  actual: string | null,
  expected?: string,
): boolean {
  if (!actual || !expected) return false;

  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return (
    expectedBytes.length >= MIN_INTERNAL_SECRET_BYTES &&
    actualBytes.length === expectedBytes.length &&
    timingSafeEqual(actualBytes, expectedBytes)
  );
}

export function isAgentRunRequestAuthorized(
  request: Request,
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return matchesInternalSecret(
    request.headers.get("x-layalga-internal"),
    env.AGENT_ROUTE_SECRET,
  );
}
