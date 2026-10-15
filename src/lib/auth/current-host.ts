import "server-only";

import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import type { AppLocale } from "@/i18n/routing";
import { getDatabaseConnection } from "@/core/db/client";
import { createClient } from "@/lib/supabase/server";

import { claimHostIdentity } from "./host-identity";

export interface HostRecord {
  id: string;
  homeId: string;
  displayName: string;
  locale: AppLocale;
}

interface HostRow {
  id: string;
  home_id: string;
  display_name: string;
  locale: AppLocale;
}

export async function getCurrentHost(): Promise<HostRecord | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user ? findHostByAuthUserId(user.id) : null;
}

export async function requireHost(locale: AppLocale = "en"): Promise<HostRecord> {
  const host = await getCurrentHost();
  if (!host) redirect(`/${locale}/sign-in`);
  return host;
}

export async function claimHostForUser(user: User): Promise<HostRecord | null> {
  const existing = await findHostByAuthUserId(user.id);
  if (existing) return existing;

  const sql = getDatabaseConnection().sql;
  const claimedHostId = await claimHostIdentity(sql, user.id, user.email);
  return claimedHostId ? findHostById(claimedHostId) : null;
}

async function findHostByAuthUserId(authUserId: string): Promise<HostRecord | null> {
  const sql = getDatabaseConnection().sql;
  const [host] = await sql<HostRow[]>`
    select host.id, host.home_id, host.display_name, host.locale
    from public.hosts as host
    where host.auth_user_id = ${authUserId}
    order by host.created_at, host.id
    limit 1
  `;
  return host ? toHostRecord(host) : null;
}

async function findHostById(hostId: string): Promise<HostRecord | null> {
  const sql = getDatabaseConnection().sql;
  const [host] = await sql<HostRow[]>`
    select host.id, host.home_id, host.display_name, host.locale
    from public.hosts as host
    where host.id = ${hostId}
  `;
  return host ? toHostRecord(host) : null;
}

function toHostRecord(row: HostRow): HostRecord {
  return {
    id: row.id,
    homeId: row.home_id,
    displayName: row.display_name,
    locale: row.locale,
  };
}
