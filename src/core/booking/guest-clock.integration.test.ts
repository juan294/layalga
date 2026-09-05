import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, afterEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { findGuestOptionsForAuthority } from "./guest-actions";
import { closeDatabase } from "@/core/db/client";

const db = postgres(
  process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:54622/postgres",
  { prepare: false, max: 2 },
);
afterAll(async () => {
  await db.end({ timeout: 5 });
  await closeDatabase();
});
afterEach(() => vi.unstubAllEnvs());

it.each(["expired", "live", "private"] as const)(
  "guest search respects household-clock %s occupancy",
  async (scenario) => {
    vi.stubEnv("MEMORY", "none");
    const homeId = randomUUID(),
      hostId = randomUUID(),
      partyId = randomUUID(),
      invitationId = randomUUID(),
      otherInvitationId = randomUUID(),
      otherPartyId = randomUUID(),
      visitId = randomUUID(),
      roomId = randomUUID();
    const now = new Date();
    const from = new Date(now.getTime() + 7 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const to = new Date(now.getTime() + 9 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    try {
      await db`insert into public.homes(id,name,timezone,demo) values(${homeId},'Guest clock regression','Europe/Madrid',true)`;
      await db`insert into public.hosts(id,home_id,display_name,locale) values(${hostId},${homeId},'Host','en')`;
      await db`insert into public.parties(id,home_id,family_name,locale) values(${partyId},${homeId},'Guest','en'),(${otherPartyId},${homeId},'Other guest','en')`;
      await db`insert into public.invitations(id,home_id,host_id,party_id,raw_message) values(${invitationId},${homeId},${hostId},${partyId},'Visit'),(${otherInvitationId},${homeId},${hostId},${otherPartyId},'Other visit')`;
      await db`insert into public.rooms(id,home_id,name,beds,guest_label,floor_label,sleeping_arrangement,maximum_capacity,inventory_state) values(${roomId},${homeId},'Room',2,'Room','Ground floor','Double bed',2,'available')`;
      await db`insert into public.visits(id,home_id,party_id,invitation_id,stay,adults,pets,status,hold_expires_at) values(${visitId},${homeId},${otherPartyId},${otherInvitationId},daterange(${from}::date,${to}::date,'[)'),2,1,'hold',${new Date(now.getTime() + 30 * 60_000).toISOString()})`;
      await db`insert into public.visit_rooms(home_id,room_id,visit_id,stay) values(${homeId},${roomId},${visitId},daterange(${from}::date,${to}::date,'[)'))`;
      await db`insert into public.demo_clock(home_id,now,enabled) values(${homeId},${new Date(now.getTime() + 60 * 60_000).toISOString()},true)`;
      if (scenario === "live") {
        await db`update public.homes set demo=false where id=${homeId}`;
      }
      if (scenario === "private") {
        const blockId = randomUUID();
        await db`delete from public.visit_rooms where visit_id=${visitId}`;
        await db`insert into public.private_room_blocks(id,home_id,stay,public_label,created_by_host_id,idempotency_key,request_hash) values(${blockId},${homeId},daterange(${from}::date,${to}::date,'[)'),'Private use',${hostId},${randomUUID()},${randomUUID()})`;
        await db`insert into public.visit_rooms(home_id,room_id,private_block_id,stay) values(${homeId},${roomId},${blockId},daterange(${from}::date,${to}::date,'[)'))`;
      }
      const result = await findGuestOptionsForAuthority(
        { id: invitationId, homeId, partyId },
        {
          from,
          to,
          nights: 2,
          adults: 2,
          children: 0,
          pets: scenario === "expired" ? 1 : 0,
        },
      );
      expect(result.status).toBe(scenario === "expired" ? "success" : "error");
      if (scenario === "expired")
        expect(result.options[0]?.recommendedRoomIds).toEqual([roomId]);
      else expect(result.options).toEqual([]);
    } finally {
      await db`delete from public.homes where id=${homeId}`;
    }
  },
);
