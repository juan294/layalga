import { z } from "zod";
import { getDatabaseConnection } from "../db/client";

const LIMIT = 10;
type Host = { id: string; homeId: string };
type Publication =
  { published: true; displayName: string } | { published: false };
interface PublicListing {
  handle: string;
  displayName: string;
}
interface ResolvedListing extends PublicListing {
  homeId: string;
  timezone: string;
}

function normalizedName(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’‘ʼ]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

export function validListingName(value: string) {
  return (
    value.length <= 80 &&
    [...value.trim()].length >= 2 &&
    [...normalizedName(value)].length >= 2 &&
    !/[\p{Cc}\p{Cf}]/u.test(value)
  );
}

export async function discoverPublicListings(query: string): Promise<{
  listings: PublicListing[];
  truncated: boolean;
}> {
  if (typeof query !== "string" || query.length > 80)
    return { listings: [], truncated: false };
  const name = normalizedName(query);
  if ([...name].length < 2 || /[\p{Cc}\p{Cf}]/u.test(name))
    return { listings: [], truncated: false };
  const rows = await getDatabaseConnection().sql<PublicListing[]>`
    select handle, display_name as "displayName"
    from public.household_public_listings
    where published and strpos(search_name, ${name}) > 0
    order by search_name, handle
    limit ${LIMIT + 1}
  `;
  return { listings: rows.slice(0, LIMIT), truncated: rows.length > LIMIT };
}

export async function resolvePublicListing(
  handle: string,
): Promise<ResolvedListing | null> {
  if (!z.uuid().safeParse(handle).success) return null;
  const [listing] = await getDatabaseConnection().sql<ResolvedListing[]>`
    select l.handle, l.display_name as "displayName", l.home_id as "homeId", h.timezone
    from public.household_public_listings l join public.homes h on h.id = l.home_id
    where l.published and l.handle = ${handle}
  `;
  return listing ?? null;
}

export async function getHostPublicListing(host: Host) {
  const [listing] = await getDatabaseConnection().sql<
    { displayName: string; published: boolean }[]
  >`
    select l.display_name as "displayName", l.published
    from public.household_public_listings l join public.hosts h on h.home_id = l.home_id
    where h.id = ${host.id} and l.home_id = ${host.homeId}
  `;
  return listing ?? null;
}

export async function setPublicListing(
  host: Host,
  change: Publication,
): Promise<void> {
  const { sql } = getDatabaseConnection();
  if (!change.published) {
    const rows = await sql`
      update public.household_public_listings l set published = false
      from public.hosts h where h.id = ${host.id} and h.home_id = ${host.homeId}
        and l.home_id = h.home_id returning l.home_id
    `;
    if (!rows.length) throw new Error("Public listing unavailable");
    return;
  }
  if (!validListingName(change.displayName))
    throw new Error("Invalid public display name");
  const displayName = change.displayName.trim().replace(/\s+/gu, " ");
  const rows = await sql`
    insert into public.household_public_listings (home_id, display_name, search_name, published)
    select h.home_id, ${displayName}, ${normalizedName(displayName)}, true
    from public.hosts h where h.id = ${host.id} and h.home_id = ${host.homeId}
    on conflict (home_id) do update set display_name = excluded.display_name,
      search_name = excluded.search_name, published = true
    returning home_id
  `;
  if (!rows.length) throw new Error("Public listing unavailable");
}
