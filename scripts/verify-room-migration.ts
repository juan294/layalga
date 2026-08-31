import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import postgres from "postgres";

const connectionUrl =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54622/postgres";
const legacyVersion = "20260831001700";

function runSupabase(args: readonly string[]): void {
  execFileSync("supabase", [...args], {
    cwd: process.cwd(),
    stdio: "inherit",
  });
}

async function seedLegacyFixture(): Promise<{
  occupancyId: string;
  roomId: string;
  visitId: string;
}> {
  const sql = postgres(connectionUrl, { max: 1, prepare: false });
  const suffix = randomUUID();

  try {
    return await sql.begin(async (transaction) => {
      const [home] = await transaction<{ id: string }[]>`
        insert into public.homes (name, timezone, demo)
        values (${`Legacy room migration ${suffix}`}, 'Europe/Madrid', false)
        returning id
      `;
      if (!home) throw new Error("Failed to create the legacy home");

      const [room] = await transaction<{ id: string }[]>`
        insert into public.rooms (home_id, name, beds)
        values (${home.id}, 'Unconfigured legacy room', 2)
        returning id
      `;
      const [host] = await transaction<{ id: string }[]>`
        insert into public.hosts (home_id, display_name, locale)
        values (${home.id}, 'Migration host', 'en')
        returning id
      `;
      const [party] = await transaction<{ id: string }[]>`
        insert into public.parties (home_id, family_name, locale)
        values (${home.id}, 'Migration party', 'en')
        returning id
      `;
      if (!room || !host || !party) {
        throw new Error("Failed to create the legacy room relationships");
      }

      const [invitation] = await transaction<{ id: string }[]>`
        insert into public.invitations (
          home_id,
          host_id,
          party_id,
          raw_message
        ) values (${home.id}, ${host.id}, ${party.id}, 'Migration fixture')
        returning id
      `;
      if (!invitation)
        throw new Error("Failed to create the legacy invitation");

      const [visit] = await transaction<{ id: string }[]>`
        insert into public.visits (
          home_id,
          party_id,
          invitation_id,
          stay,
          adults,
          status
        ) values (
          ${home.id},
          ${party.id},
          ${invitation.id},
          daterange('2026-10-10', '2026-10-12', '[)'),
          2,
          'confirmed'
        )
        returning id
      `;
      if (!visit) throw new Error("Failed to create the legacy visit");

      const [occupancy] = await transaction<{ id: string }[]>`
        insert into public.visit_rooms (visit_id, room_id, home_id, stay)
        values (
          ${visit.id},
          ${room.id},
          ${home.id},
          daterange('2026-10-10', '2026-10-12', '[)')
        )
        returning id
      `;
      if (!occupancy) throw new Error("Failed to create the legacy occupancy");

      return {
        occupancyId: occupancy.id,
        roomId: room.id,
        visitId: visit.id,
      };
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function verifyMigratedFixture(fixture: {
  occupancyId: string;
  roomId: string;
  visitId: string;
}): Promise<void> {
  const sql = postgres(connectionUrl, { max: 1, prepare: false });

  try {
    const [row] = await sql<
      {
        guest_label: string | null;
        inventory_state: string;
        maximum_capacity: number;
        occupancy_id: string;
        private_block_id: string | null;
        visit_id: string;
      }[]
    >`
      select
        room.guest_label,
        room.inventory_state,
        room.maximum_capacity,
        occupancy.id as occupancy_id,
        occupancy.private_block_id,
        occupancy.visit_id
      from public.rooms room
      join public.visit_rooms occupancy on occupancy.room_id = room.id
      where room.id = ${fixture.roomId}
    `;

    if (
      !row ||
      row.guest_label !== null ||
      row.inventory_state !== "draft" ||
      row.maximum_capacity !== 2 ||
      row.occupancy_id !== fixture.occupancyId ||
      row.private_block_id !== null ||
      row.visit_id !== fixture.visitId
    ) {
      throw new Error(
        `Room migration verification failed: ${JSON.stringify(row)}`,
      );
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function main(): Promise<void> {
  try {
    runSupabase(["db", "reset", "--version", legacyVersion, "--no-seed"]);
    const fixture = await seedLegacyFixture();
    runSupabase(["migration", "up", "--local"]);
    await verifyMigratedFixture(fixture);
    console.log("Room migration compatibility verification passed.");
  } finally {
    runSupabase(["db", "reset"]);
  }
}

await main();
