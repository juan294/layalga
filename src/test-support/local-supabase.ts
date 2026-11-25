import postgres from "postgres";

import { createDatabase } from "@/core/db/client";

function isLocal(value: string) {
  return ["127.0.0.1", "localhost", "[::1]"].includes(new URL(value).hostname);
}

/** The disposable local stack only. Refuses any other database or Auth URL. */
export function localSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54621";
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
  const databaseUrl =
    process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:54622/postgres";
  if (!isLocal(url) || !isLocal(databaseUrl))
    throw new Error("These fixtures require local Supabase");
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL &&
    new URL(databaseUrl).port !== "54622"
  )
    throw new Error(
      "Set NEXT_PUBLIC_SUPABASE_URL to the stack that owns DATABASE_URL",
    );
  // The default postgres login cannot switch to the Auth and runtime roles.
  const admin = new URL(databaseUrl);
  admin.username = "supabase_admin";
  return {
    url,
    key,
    issuer: `${url}/auth/v1`,
    databaseUrl,
    adminUrl: admin.toString(),
  };
}

export function localAdmin(role?: string) {
  return postgres(localSupabase().adminUrl, {
    max: 1,
    prepare: false,
    ...(role ? { connection: { role } } : {}),
  });
}

/** The client that production builds, with the rights of the web runtime. */
export function localWebDatabase() {
  const url = new URL(localSupabase().adminUrl);
  url.searchParams.set("role", "layalga_web_runtime");
  return createDatabase(url.toString());
}
