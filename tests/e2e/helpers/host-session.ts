import { randomUUID } from "node:crypto";

import type { BrowserContext } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import type { Sql } from "postgres";

type SessionCookie = { name: string; value: string };
type CreateClient = typeof createServerClient;

export const LOCAL_ONLY_MESSAGE =
  "signInAsHost is local-only: NEXT_PUBLIC_SUPABASE_URL must point at 127.0.0.1 or localhost";
export const EMAIL_AUTH_DISABLED_MESSAGE =
  "local email sign-in is disabled; check supabase/config.toml [auth.email]";

/**
 * Signs a fixture host in through real local Supabase Auth and installs the
 * session cookies in the Playwright context. The app then resolves the host
 * through its normal path (`hosts.auth_user_id`), with no test-only cookie.
 */
export async function signInAsHost(
  context: Pick<BrowserContext, "addCookies">,
  { sql, hostId }: { sql: Sql; hostId: string },
  env: Readonly<Record<string, string | undefined>> = process.env,
  createClient: CreateClient = createServerClient,
): Promise<{ userId: string; email: string }> {
  const url = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
  if (!isLocalUrl(url)) throw new Error(LOCAL_ONLY_MESSAGE);

  const jar = new Map<string, string>();
  const supabase = createClient(url, key, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (cookies: SessionCookie[]) => {
        for (const { name, value } of cookies) {
          if (value) jar.set(name, value);
          else jar.delete(name);
        }
      },
    },
  });

  const email = `host-${randomUUID()}@fixture.test`;
  const { data, error } = await supabase.auth.signUp({
    email,
    password: randomUUID(),
  });
  if (error || !data.session || !data.user) {
    throw new Error(
      `${EMAIL_AUTH_DISABLED_MESSAGE}${error ? ` (${error.message})` : ""}`,
    );
  }

  await sql`
    update public.hosts set auth_user_id = ${data.user.id} where id = ${hostId}
  `;
  const appUrl = env.APP_URL ?? env.E2E_BASE_URL ?? "http://127.0.0.1:3008";
  await context.addCookies(
    [...jar].map(([name, value]) => ({
      name,
      value,
      url: appUrl,
      sameSite: "Lax" as const,
    })),
  );
  return { userId: data.user.id, email };
}

function isLocalUrl(value: string): boolean {
  try {
    const { hostname } = new URL(value);
    return hostname === "127.0.0.1" || hostname === "localhost";
  } catch {
    return false;
  }
}
