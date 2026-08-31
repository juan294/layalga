import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enqueue: vi.fn(),
  loadGuestInvitation: vi.fn(),
  loadGuestRoomSearchWindow: vi.fn(),
  roomOptionsForStay: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw { digest: "NEXT_REDIRECT;test" };
  }),
}));
vi.mock("@/agent/client", () => ({
  getAgentClient: () => ({ enqueue: mocks.enqueue }),
}));
vi.mock("@/core/db/client", () => ({
  getDatabaseConnection: () => ({ db: {}, sql: vi.fn() }),
}));
vi.mock("@/core/rooms/search", () => ({
  loadGuestRoomSearchWindow: mocks.loadGuestRoomSearchWindow,
  roomOptionsForStay: mocks.roomOptionsForStay,
}));
vi.mock("./guest-data", () => ({
  loadGuestInvitation: mocks.loadGuestInvitation,
}));

import { findGuestOptions, submitGuestVisit } from "./actions";

const roomId = "00000000-0000-4000-8000-000000000001";
const invitationId = "00000000-0000-4000-8000-000000000002";
const homeId = "00000000-0000-4000-8000-000000000003";

describe("guest room actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadGuestInvitation.mockResolvedValue({
      id: invitationId,
      homeId,
      structured: {},
    });
    mocks.loadGuestRoomSearchWindow.mockResolvedValue({
      homeId,
      home: { petsTogetherAllowed: true, maxFamiliesWithChildren: 2 },
      rooms: [],
      overrides: [],
      occupancies: [],
      visits: [],
    });
    mocks.roomOptionsForStay.mockReturnValue([
      {
        id: roomId,
        guestLabel: "Garden room",
        floorLabel: "Ground floor",
        sleepingArrangement: "Double bed",
        overflowArrangement: null,
        standardCapacity: 2,
        maximumCapacity: 2,
        overflowPolicy: "none",
        displayOrder: 1,
        name: "Internal room name",
        privateNotes: "Host only",
      },
    ]);
  });

  test("includes party counts and returns deterministic guest-safe room choices", async () => {
    const form = new FormData();
    for (const [key, value] of Object.entries({
      token: "guest-token",
      locale: "en",
      from: "2026-09-18",
      to: "2026-09-20",
      nights: "2",
      adults: "2",
      children: "0",
      pets: "0",
    })) {
      form.set(key, value);
    }

    const result = await findGuestOptions(
      { status: "idle", options: [] },
      form,
    );

    expect(result.status).toBe("success");
    expect(mocks.loadGuestRoomSearchWindow).toHaveBeenCalledTimes(1);
    expect(result.criteria).toMatchObject({ adults: 2, children: 0, pets: 0 });
    expect(result.options[0]?.recommendedRoomIds).toEqual([roomId]);
    expect(result.options[0]?.rooms[0]).toEqual({
      id: roomId,
      guestLabel: "Garden room",
      floorLabel: "Ground floor",
      sleepingArrangement: "Double bed",
      overflowArrangement: null,
      standardCapacity: 2,
      maximumCapacity: 2,
    });
  });

  test("places exact room IDs and consent in trusted guest_submit authority", async () => {
    mocks.enqueue.mockResolvedValue({ runId: "run-1" });
    const form = new FormData();
    for (const [key, value] of Object.entries({
      token: "guest-token",
      locale: "en",
      stay: "2026-09-18|2026-09-20",
      adults: "2",
      children: "0",
      pets: "0",
      overflowConsent: "on",
    })) {
      form.set(key, value);
    }
    form.append("roomIds", roomId);

    await expect(
      submitGuestVisit({ status: "idle" }, form),
    ).rejects.toMatchObject({ digest: "NEXT_REDIRECT;test" });
    expect(mocks.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        task: "guest_submit",
        roomIds: [roomId],
        overflowConsent: true,
      }),
    );
  });

  test("offers a deterministic maximum-capacity fallback with host consent", async () => {
    mocks.roomOptionsForStay.mockReturnValue([
      {
        id: roomId,
        guestLabel: "Garden room",
        floorLabel: "Ground floor",
        sleepingArrangement: "Sofa bed",
        overflowArrangement: "Double air mattress",
        standardCapacity: 2,
        maximumCapacity: 4,
        overflowPolicy: "host_approval",
        displayOrder: 1,
      },
    ]);
    const form = new FormData();
    for (const [key, value] of Object.entries({
      token: "guest-token",
      locale: "en",
      from: "2026-09-18",
      to: "2026-09-20",
      nights: "2",
      adults: "4",
      children: "0",
      pets: "0",
    })) {
      form.set(key, value);
    }

    const result = await findGuestOptions(
      { status: "idle", options: [] },
      form,
    );

    expect(result.status).toBe("success");
    expect(result.options[0]?.recommendedRoomIds).toEqual([roomId]);
    expect(result.options[0]?.rooms[0]?.maximumCapacity).toBe(4);
  });
});
