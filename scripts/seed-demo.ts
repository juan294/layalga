import { pathToFileURL } from "node:url";

import postgres from "postgres";

import { hashLinkToken } from "../src/core/booking/invitations";

export const DEMO_SEED = {
  home: {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Casa Ayalga",
    timezone: "Europe/Madrid",
    petsTogetherAllowed: false,
    maxFamiliesWithChildren: 1,
    demo: true,
  },
  rooms: [
    {
      id: "00000000-0000-4000-8000-000000000101",
      name: "Cuartu del Horreu",
      beds: 2,
    },
    {
      id: "00000000-0000-4000-8000-000000000102",
      name: "Cuartu de la Fonte",
      beds: 2,
    },
    {
      id: "00000000-0000-4000-8000-000000000103",
      name: "Cuartu del Teixu",
      beds: 3,
    },
  ],
  hosts: [
    {
      id: "00000000-0000-4000-8000-000000000201",
      displayName: "Nel",
      locale: "es",
    },
    {
      id: "00000000-0000-4000-8000-000000000202",
      displayName: "Covadonga",
      locale: "en",
    },
  ],
  parties: [
    {
      id: "00000000-0000-4000-8000-000000000301",
      familyName: "Familia Vega",
      locale: "es",
      guestLink: "/es/g/vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv",
      linkTokenExpiresAt: "2026-10-01T00:00:00+02:00",
      invitation: {
        id: "00000000-0000-4000-8000-000000000401",
        hostId: "00000000-0000-4000-8000-000000000201",
        rawMessage:
          "Oye, los Vega quieren venir a la casa un finde de septiembre, son Marta y Xuan con los dos crios. Les va mejor mediados de mes.",
        adults: 2,
        children: 2,
        pets: 0,
        specialRequests: [],
        preferredStay: ["2026-09-18", "2026-09-21"],
        roomAllocation: ["Cuartu del Teixu", "Cuartu del Horreu"],
      },
    },
    {
      id: "00000000-0000-4000-8000-000000000302",
      familyName: "The Oteros",
      locale: "en",
      guestLink: "/en/g/ooooooooooooooooooooooooooooooooooooooooooo",
      linkTokenExpiresAt: "2026-10-01T00:00:00+02:00",
      invitation: {
        id: "00000000-0000-4000-8000-000000000402",
        hostId: "00000000-0000-4000-8000-000000000202",
        rawMessage:
          "Hi! Inviting Ana and Pelayo Otero for the weekend of the 19th, they'd bring their dog Nube and possibly Ana's mother who uses a wheelchair.",
        adults: 2,
        children: 0,
        pets: 1,
        specialRequests: [
          "Ana's mother uses a wheelchair and needs ground-floor access",
        ],
        preferredStay: ["2026-09-19", "2026-09-21"],
        roomAllocation: ["Cuartu de la Fonte"],
      },
    },
  ],
  clock: {
    start: "2026-09-07T10:00:00+02:00",
    chase: "2026-09-15T09:00:00+02:00",
    escalation: "2026-09-16T09:05:00+02:00",
  },
} as const;

export interface SeedDemoResult {
  homeId: string;
  hostIds: readonly string[];
  partyIds: readonly string[];
  invitationIds: readonly string[];
}

export async function seedDemo(
  connectionString: string,
  tokenSecret: string,
): Promise<SeedDemoResult> {
  if (!tokenSecret) {
    throw new Error("LINK_TOKEN_SECRET is required");
  }

  const sql = postgres(connectionString, { prepare: false, max: 1 });

  try {
    await sql.begin(async (transaction) => {
      await transaction`delete from public.homes where name = ${DEMO_SEED.home.name}`;

      await transaction`
        insert into public.homes (
          id,
          name,
          timezone,
          pets_together_allowed,
          max_families_with_children,
          demo
        ) values (
          ${DEMO_SEED.home.id},
          ${DEMO_SEED.home.name},
          ${DEMO_SEED.home.timezone},
          ${DEMO_SEED.home.petsTogetherAllowed},
          ${DEMO_SEED.home.maxFamiliesWithChildren},
          ${DEMO_SEED.home.demo}
        )
      `;

      for (const room of DEMO_SEED.rooms) {
        await transaction`
          insert into public.rooms (id, home_id, name, beds)
          values (${room.id}, ${DEMO_SEED.home.id}, ${room.name}, ${room.beds})
        `;
      }

      for (const host of DEMO_SEED.hosts) {
        await transaction`
          insert into public.hosts (id, home_id, display_name, locale)
          values (
            ${host.id},
            ${DEMO_SEED.home.id},
            ${host.displayName},
            ${host.locale}
          )
        `;
      }

      for (const party of DEMO_SEED.parties) {
        const token = party.guestLink.split("/").at(-1);
        if (!token) {
          throw new Error(
            `Guest link token is missing for ${party.familyName}`,
          );
        }
        const linkTokenHash = hashLinkToken(token, tokenSecret);

        await transaction`
          insert into public.parties (
            id,
            home_id,
            family_name,
            locale,
            link_token,
            link_token_expires_at
          ) values (
            ${party.id},
            ${DEMO_SEED.home.id},
            ${party.familyName},
            ${party.locale},
            ${linkTokenHash},
            ${party.linkTokenExpiresAt}
          )
        `;

        const structured = {
          adults: party.invitation.adults,
          children: party.invitation.children,
          pets: party.invitation.pets,
          specialRequests: party.invitation.specialRequests,
          preferredStay: party.invitation.preferredStay,
          roomAllocation: party.invitation.roomAllocation,
        };

        await transaction`
          insert into public.invitations (
            id,
            home_id,
            host_id,
            party_id,
            raw_message,
            structured,
            status
          ) values (
            ${party.invitation.id},
            ${DEMO_SEED.home.id},
            ${party.invitation.hostId},
            ${party.id},
            ${party.invitation.rawMessage},
            ${transaction.json(structured)},
            'tentative'
          )
        `;
      }

      await transaction`
        insert into public.demo_clock (home_id, now, enabled)
        values (${DEMO_SEED.home.id}, ${DEMO_SEED.clock.start}, true)
      `;
    });
  } finally {
    await sql.end({ timeout: 5 });
  }

  return {
    homeId: DEMO_SEED.home.id,
    hostIds: DEMO_SEED.hosts.map((host) => host.id),
    partyIds: DEMO_SEED.parties.map((party) => party.id),
    invitationIds: DEMO_SEED.parties.map((party) => party.invitation.id),
  };
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  const tokenSecret = process.env.LINK_TOKEN_SECRET;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  if (!tokenSecret) {
    throw new Error("LINK_TOKEN_SECRET is required");
  }

  const result = await seedDemo(connectionString, tokenSecret);
  console.log(JSON.stringify(result));
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
