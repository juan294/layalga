import type { Sql } from "postgres";

import { issueLinkToken } from "@/core/booking/invitations";

/**
 * Disposable, non-demo households for browser tests, integration tests and
 * release probes. Every row lives under one new home, so `cleanup()` removes
 * the household with one cascading delete plus the durable agent sessions
 * and local auth users that are keyed outside the home.
 */

export interface FixtureRoom {
  name: string;
  beds: number;
  guestLabel: string;
  floorLabel: string;
  sleepingArrangement: string;
  overflowArrangement: string | null;
  maximumCapacity: number;
  inventoryState: "available" | "withheld";
  overflowPolicy: "none" | "host_approval";
}

export interface FixtureParty {
  familyName: string;
  locale?: "en" | "es";
  /** Defaults to "A visit"; the household tag is always appended. */
  rawMessage?: string;
  adults?: number;
  children?: number;
  pets?: number;
  specialRequests?: string[];
  /** Defaults to a weekend at least three weeks after `now`. */
  preferredStay?: [string, string];
  roomAllocation?: string[];
}

export interface FixtureHouseholdOptions {
  /** Unique per run; becomes the home name and the raw-message tag. */
  label: string;
  tokenSecret: string;
  rooms?: readonly FixtureRoom[];
  parties?: readonly FixtureParty[];
  hosts?: number;
  now?: Date;
  /**
   * Local browser tests bind hosts to throwaway Supabase Auth users; set this
   * so cleanup deletes them. Never set it for a hosted database.
   */
  deleteBoundAuthUsers?: boolean;
}

export interface FixtureGuest {
  partyId: string;
  invitationId: string;
  familyName: string;
  /** Raw bearer token for `/{locale}/g/<token>`. */
  token: string;
  preferredStay: [string, string];
}

export interface FixtureHousehold {
  homeId: string;
  homeName: string;
  /** Raw-message suffix that tags this household's runs for cleanup. */
  tag: string;
  hostIds: string[];
  roomIds: string[];
  parties: FixtureGuest[];
  cleanup(): Promise<void>;
}

/** Builds the raw-message suffix used to tag and later find synthetic runs. */
export function markerSuffix(marker: string): string {
  return ` [${marker}]`;
}

/** The three-room shape the scripted model and browser tests were built on. */
export const FIXTURE_ROOMS: readonly FixtureRoom[] = [
  {
    name: "Upstairs guest room",
    beds: 2,
    guestLabel: "Guest Room",
    floorLabel: "Upper floor",
    sleepingArrangement: "One double bed",
    overflowArrangement: null,
    maximumCapacity: 2,
    inventoryState: "available",
    overflowPolicy: "none",
  },
  {
    name: "Garage conversion",
    beds: 2,
    guestLabel: "Garage Room",
    floorLabel: "Ground floor",
    sleepingArrangement: "One sofa bed",
    overflowArrangement: "One double air mattress",
    maximumCapacity: 4,
    inventoryState: "available",
    overflowPolicy: "host_approval",
  },
  {
    name: "Home office",
    beds: 3,
    guestLabel: "Office Room",
    floorLabel: "Upper floor",
    sleepingArrangement: "One double bed",
    overflowArrangement: null,
    maximumCapacity: 3,
    inventoryState: "withheld",
    overflowPolicy: "none",
  },
];

/** A host message the scripted model captures as "Familia Vega". */
export const VEGA_CAPTURE_MESSAGE =
  "Oye, los Vega quieren venir a la casa un finde, son Marta y Xuan con los dos crios.";

/**
 * Party names match the scripted model's capture fixtures
 * (`src/agent/scripted-model-selection.ts`), so local runs behave as the
 * production model would on the same request.
 */
export function fixtureParties(now = new Date()): FixtureParty[] {
  return [
    {
      familyName: "Familia Vega",
      locale: "es",
      rawMessage: VEGA_CAPTURE_MESSAGE,
      adults: 2,
      children: 2,
      pets: 0,
      specialRequests: [],
      preferredStay: fixtureStay(now, 0, 3),
      roomAllocation: ["Home office", "Upstairs guest room"],
    },
    {
      familyName: "The Parkers",
      locale: "en",
      rawMessage:
        "Inviting Emma and Daniel Parker for a weekend, they'd bring their dog Nube and possibly Emma's mother who uses a wheelchair.",
      adults: 2,
      children: 0,
      pets: 1,
      specialRequests: [
        "Emma's mother uses a wheelchair and needs ground-floor access",
      ],
      preferredStay: fixtureStay(now, 1, 2),
      roomAllocation: ["Garage conversion"],
    },
  ];
}

export function findFixtureGuest(
  household: Pick<FixtureHousehold, "parties">,
  familyName: string,
): FixtureGuest {
  const guest = household.parties.find(
    (party) => party.familyName === familyName,
  );
  if (!guest) throw new Error(`Fixture party is missing: ${familyName}`);
  return guest;
}

/** A stay starting `offsetDays` after the first Friday at least 21 days ahead. */
export function fixtureStay(
  now: Date,
  offsetDays: number,
  nights: number,
): [string, string] {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 21),
  );
  start.setUTCDate(start.getUTCDate() + ((5 - start.getUTCDay() + 7) % 7));
  start.setUTCDate(start.getUTCDate() + offsetDays);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + nights);
  return [isoDate(start), isoDate(end)];
}

export async function createFixtureHousehold(
  sql: Sql,
  options: FixtureHouseholdOptions,
): Promise<FixtureHousehold> {
  const now = options.now ?? new Date();
  const rooms = options.rooms ?? FIXTURE_ROOMS;
  const parties = options.parties ?? fixtureParties(now);
  const hostCount = options.hosts ?? 1;
  const tag = markerSuffix(options.label);
  const linkExpiresAt = new Date(now.getTime() + 60 * 86_400_000);

  try {
    const built = await sql.begin(async (transaction) => {
      const [home] = await transaction<{ id: string }[]>`
        insert into public.homes (
          name, timezone, pets_together_allowed, max_families_with_children
        ) values (${options.label}, 'Europe/Madrid', false, 1)
        returning id
      `;
      const homeId = home!.id;

      const roomIds: string[] = [];
      for (const [index, room] of rooms.entries()) {
        const [row] = await transaction<{ id: string }[]>`
          insert into public.rooms (
            home_id, name, beds, guest_label, floor_label,
            sleeping_arrangement, overflow_arrangement, maximum_capacity,
            inventory_state, overflow_policy, display_order
          ) values (
            ${homeId}, ${room.name}, ${room.beds}, ${room.guestLabel},
            ${room.floorLabel}, ${room.sleepingArrangement},
            ${room.overflowArrangement}, ${room.maximumCapacity},
            ${room.inventoryState}, ${room.overflowPolicy}, ${index + 1}
          )
          returning id
        `;
        roomIds.push(row!.id);
      }

      const hostIds: string[] = [];
      for (let number = 1; number <= hostCount; number += 1) {
        const [host] = await transaction<{ id: string }[]>`
          insert into public.hosts (home_id, display_name, locale)
          values (${homeId}, ${`Host ${number}`}, 'en')
          returning id
        `;
        hostIds.push(host!.id);
      }

      const guests: FixtureGuest[] = [];
      for (const [index, party] of parties.entries()) {
        const preferredStay = party.preferredStay ?? fixtureStay(now, index, 2);
        const link = issueLinkToken(options.tokenSecret);
        const [partyRow] = await transaction<{ id: string }[]>`
          insert into public.parties (home_id, family_name, locale)
          values (${homeId}, ${party.familyName}, ${party.locale ?? "en"})
          returning id
        `;
        const structured = {
          adults: party.adults ?? 2,
          children: party.children ?? 0,
          pets: party.pets ?? 0,
          specialRequests: party.specialRequests ?? [],
          preferredStay,
          roomAllocation: party.roomAllocation ?? [],
        };
        const [invitation] = await transaction<{ id: string }[]>`
          insert into public.invitations (
            home_id, host_id, party_id, raw_message, structured, status,
            link_token, link_token_expires_at
          ) values (
            ${homeId}, ${hostIds[index % hostIds.length]!}, ${partyRow!.id},
            ${(party.rawMessage ?? "A visit") + tag},
            ${transaction.json(structured)}, 'tentative', ${link.hash},
            ${linkExpiresAt}
          )
          returning id
        `;
        guests.push({
          partyId: partyRow!.id,
          invitationId: invitation!.id,
          familyName: party.familyName,
          token: link.token,
          preferredStay,
        });
      }

      return { homeId, roomIds, hostIds, guests };
    });

    return {
      homeId: built.homeId,
      homeName: options.label,
      tag,
      hostIds: built.hostIds,
      roomIds: built.roomIds,
      parties: built.guests,
      cleanup: () =>
        removeFixtureHousehold(sql, built.homeId, options.label, {
          deleteBoundAuthUsers: options.deleteBoundAuthUsers ?? false,
        }),
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Fixture household "${options.label}" failed: ${reason}`, {
      cause: error,
    });
  }
}

/**
 * Removes one fixture household by id and name. Durable agent sessions are
 * keyed by session id rather than home, so they are deleted first. Auth users
 * are deleted only when the caller created them locally.
 */
export async function removeFixtureHousehold(
  sql: Sql,
  homeId: string,
  homeName: string,
  { deleteBoundAuthUsers = false }: { deleteBoundAuthUsers?: boolean } = {},
): Promise<void> {
  await sql.begin(async (transaction) => {
    // Session ids follow resolveSessionId (src/agent/run-task.ts).
    await transaction`
      delete from public.agent_sessions
      where session_id in (
        select session_id from public.runs where home_id = ${homeId}
        union all
        select 'inv_' || id from public.invitations where home_id = ${homeId}
        union all
        select 'capture_' || id from public.hosts where home_id = ${homeId}
        union all
        select 'room_' || id from public.hosts where home_id = ${homeId}
        union all
        select 'tick_' || id from public.scheduled_jobs where home_id = ${homeId}
      )
    `;
    if (deleteBoundAuthUsers) {
      await transaction`
        with bound as (
          select auth_user_id from public.hosts
          where home_id = ${homeId} and auth_user_id is not null
        ), removed as (
          delete from public.homes where id = ${homeId} and name = ${homeName}
        )
        delete from auth.users where id in (select auth_user_id from bound)
      `;
    } else {
      await transaction`
        delete from public.homes where id = ${homeId} and name = ${homeName}
      `;
    }
  });
  const [remaining] = await sql<{ count: number }[]>`
    select count(*)::int as count from public.homes where id = ${homeId}
  `;
  if (remaining?.count !== 0) {
    throw new Error(`Fixture household "${homeName}" was not removed`);
  }
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
