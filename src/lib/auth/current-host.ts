import "server-only";

import type { User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import type { AppLocale } from "@/i18n/routing";
import { getDatabaseConnection } from "@/core/db/client";
import { createClient } from "@/lib/supabase/server";

import { DEMO_HOST_COOKIE, readDemoHostCookie } from "./demo-session";
import { hostEmailIndex } from "./host-emails";

export interface HostRecord {
  id: string;
  homeId: string;
  displayName: string;
  locale: AppLocale;
  demo: boolean;
}

interface HostRow {
  id: string;
  home_id: string;
  display_name: string;
  locale: AppLocale;
  demo: boolean;
}

export async function getCurrentHost(): Promise<HostRecord | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const authenticatedHost = await findHostByAuthUserId(user.id);
    if (authenticatedHost) return authenticatedHost;
  }

  if (process.env.DEMO_MODE !== "true") return null;

  const cookieStore = await cookies();
  const hostId = readDemoHostCookie(cookieStore.get(DEMO_HOST_COOKIE)?.value);
  return hostId ? findDemoHostById(hostId) : null;
}

export async function requireHost(locale: AppLocale = "en"): Promise<HostRecord> {
  const host = await getCurrentHost();
  if (!host) redirect(`/${locale}/sign-in`);
  return host;
}

export async function claimHostForUser(user: User): Promise<HostRecord | null> {
  const existing = await findHostByAuthUserId(user.id);
  if (existing) return existing;

  const emailIndex = hostEmailIndex(user.email);
  if (emailIndex < 0) return null;

  const sql = getDatabaseConnection().sql;
  const [claimed] = await sql<{ id: string }[]>`
    with target as (
      select id
      from public.hosts
      order by created_at, id
      limit 1 offset ${emailIndex}
    )
    update public.hosts as host
    set auth_user_id = ${user.id}
    from target
    where host.id = target.id
      and (host.auth_user_id is null or host.auth_user_id = ${user.id})
    returning host.id
  `;

  return claimed ? findHostById(claimed.id) : null;
}

async function findHostByAuthUserId(authUserId: string): Promise<HostRecord | null> {
  const sql = getDatabaseConnection().sql;
  const [host] = await sql<HostRow[]>`
    select host.id, host.home_id, host.display_name, host.locale, home.demo
    from public.hosts as host
    join public.homes as home on home.id = host.home_id
    where host.auth_user_id = ${authUserId}
    order by host.created_at, host.id
    limit 1
  `;
  return host ? toHostRecord(host) : null;
}

async function findDemoHostById(hostId: string): Promise<HostRecord | null> {
  const host = await findHostRowById(hostId);
  return host?.demo ? toHostRecord(host) : null;
}

async function findHostById(hostId: string): Promise<HostRecord | null> {
  const host = await findHostRowById(hostId);
  return host ? toHostRecord(host) : null;
}

async function findHostRowById(hostId: string): Promise<HostRow | null> {
  const sql = getDatabaseConnection().sql;
  const [host] = await sql<HostRow[]>`
    select host.id, host.home_id, host.display_name, host.locale, home.demo
    from public.hosts as host
    join public.homes as home on home.id = host.home_id
    where host.id = ${hostId}
  `;
  return host ?? null;
}

function toHostRecord(row: HostRow): HostRecord {
  return {
    id: row.id,
    homeId: row.home_id,
    displayName: row.display_name,
    locale: row.locale,
    demo: row.demo,
  };
}
