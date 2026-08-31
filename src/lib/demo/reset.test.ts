import { readFile } from "node:fs/promises";

import { describe, expect, test } from "vitest";

import { DEMO_SEED, resetDemoHome } from "./reset";

describe("demo reset boundary", () => {
  test("exposes one deterministic synthetic home through a narrow service", () => {
    expect(resetDemoHome).toBeTypeOf("function");
    expect(DEMO_SEED.home).toMatchObject({
      demo: true,
      id: "00000000-0000-4000-8000-000000000001",
      name: "Casa Ayalga",
    });
    expect(new Set(DEMO_SEED.rooms.map(({ id }) => id)).size).toBe(
      DEMO_SEED.rooms.length,
    );
    expect(new Set(DEMO_SEED.parties.map(({ id }) => id)).size).toBe(
      DEMO_SEED.parties.length,
    );
    expect(DEMO_SEED.rooms).toEqual([
      expect.objectContaining({
        guestLabel: "Horreu Room",
        beds: 2,
        maximumCapacity: 2,
        inventoryState: "available",
        overflowPolicy: "none",
      }),
      expect.objectContaining({
        guestLabel: "Fonte Room",
        beds: 2,
        maximumCapacity: 4,
        inventoryState: "available",
        overflowPolicy: "host_approval",
        overflowArrangement: "One double air mattress",
      }),
      expect.objectContaining({
        guestLabel: "Teixu Room",
        beds: 3,
        maximumCapacity: 3,
        inventoryState: "withheld",
        overflowPolicy: "none",
      }),
    ]);
    expect(DEMO_SEED.roomProof.overflowGuest.selectedRoomIds).toEqual([
      DEMO_SEED.rooms[0].id,
      DEMO_SEED.rooms[1].id,
    ]);
    expect(DEMO_SEED.roomProof.openedStay.roomId).toBe(DEMO_SEED.rooms[2].id);
    expect(DEMO_SEED.roomProof.hospitalityOpening.roomId).toBe(
      DEMO_SEED.rooms[2].id,
    );
    expect(
      DEMO_SEED.roomProof.privateBlock.from <
        DEMO_SEED.roomProof.privateBlock.to,
    ).toBe(true);
    expect(
      DEMO_SEED.roomProof.openedStay.from < DEMO_SEED.roomProof.openedStay.to,
    ).toBe(true);
  });

  test("keeps the route on the service boundary and CLI setup in the script", async () => {
    const [route, script] = await Promise.all([
      readFile(
        new URL("../../app/api/demo/reset/route.ts", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../../../scripts/seed-demo.ts", import.meta.url),
        "utf8",
      ),
    ]);

    expect(route).toContain("@/lib/demo/reset");
    expect(route).not.toContain("scripts/seed-demo");
    expect(script).toContain("@/lib/demo/reset");
    expect(script).toContain("process.env.DATABASE_URL");
    expect(script).toContain("process.env.LINK_TOKEN_SECRET");
  });
});
