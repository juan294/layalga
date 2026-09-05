import { matchesInternalSecret } from "../agent/internal-auth";

export function isTickRequestAuthorized(
  request: Request,
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return (
    matchesInternalSecret(
      request.headers.get("x-layalga-internal"),
      env.TICK_SECRET,
    ) ||
    matchesInternalSecret(
      bearerToken(request.headers.get("authorization")),
      env.CRON_SECRET,
    )
  );
}

function bearerToken(authorization: string | null): string | null {
  if (!authorization?.startsWith("Bearer ")) return null;
  return authorization.slice("Bearer ".length);
}
