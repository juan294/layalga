import { randomUUID } from "node:crypto";
import type { BrowserContext } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import type { Sql } from "postgres";

/** An unclaimed local user with a synthetic Google identity and real Auth cookies. */
export async function createFixtureRequester(db: Sql) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
  if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname))
    throw new Error("Requester fixtures require local Supabase");
  const jar = new Map<string, string>();
  const client = createServerClient(url, key, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (values) => {
        for (const { name, value } of values) {
          if (value) jar.set(name, value);
          else jar.delete(name);
        }
      },
    },
  });
  const email = `requester-${randomUUID()}@fixture.test`;
  const password = randomUUID();
  const { data, error } = await client.auth.signUp({ email, password });
  if (error || !data.user || !data.session)
    throw new Error("Could not create a local requester fixture");
  const userId = data.user.id;
  const cleanup = async () => {
    await db`delete from auth.users where id=${userId}`;
  };
  try {
    await db`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at)
      values(${"google-" + userId},${userId},${db.json({ sub: userId, email, email_verified: true })},'google',now(),now())`;
    return {
      userId,
      email,
      cleanup,
      /** A new web session of this account, outside the browser. */
      async accessToken() {
        const login = await client.auth.signInWithPassword({ email, password });
        if (login.error || !login.data.session)
          throw new Error("Could not sign in the local requester");
        return login.data.session.access_token;
      },
      async signIn(context: Pick<BrowserContext, "addCookies">) {
        const login = await client.auth.signInWithPassword({ email, password });
        if (login.error || !login.data.session)
          throw new Error("Could not sign in the local requester");
        await context.addCookies(
          [...jar].map(([name, value]) => ({
            name,
            value,
            url: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3008",
            sameSite: "Lax" as const,
          })),
        );
      },
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
