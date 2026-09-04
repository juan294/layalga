import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  applyGuestReconfirmation: vi.fn(),
  clock: { now: vi.fn(() => new Date("2026-09-04T10:00:00.000Z")) },
  database: {},
  enqueue: vi.fn(),
  loadGuestInvitation: vi.fn(),
  loadClock: vi.fn(),
  resolveGuestInvitationAuthority: vi.fn(),
  loadGuestRoomSearchWindow: vi.fn(),
  redirect: vi.fn(() => {
    throw { digest: "NEXT_REDIRECT;test" };
  }),
  roomOptionsForStay: vi.fn(),
  scheduler: { schedule: vi.fn(), cancel: vi.fn() },
  schedulerForHome: vi.fn(),
  sql: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));
vi.mock("@/agent/client", () => ({
  getAgentClient: () => ({ enqueue: mocks.enqueue }),
}));
vi.mock("@/agent/scheduler", () => ({
  schedulerForHome: mocks.schedulerForHome,
}));
vi.mock("@/core/clock", () => ({
  DbDemoClock: { load: mocks.loadClock },
  SystemClock: class SystemClock {},
}));
vi.mock("@/core/db/client", () => ({
  getDatabaseConnection: () => ({ db: mocks.database, sql: mocks.sql }),
}));
vi.mock("@/core/reconfirmation/apply-guest-answer", () => ({
  applyGuestReconfirmation: mocks.applyGuestReconfirmation,
}));
vi.mock("@/core/rooms/search", () => ({
  loadGuestRoomSearchWindow: mocks.loadGuestRoomSearchWindow,
  roomOptionsForStay: mocks.roomOptionsForStay,
}));
vi.mock("@/core/booking/guest-invitation", () => ({
  loadGuestInvitation: mocks.loadGuestInvitation,
  resolveGuestInvitationAuthority: mocks.resolveGuestInvitationAuthority,
}));

import {
  findGuestOptions,
  reconfirmGuest,
  requestGuestChange,
  submitGuestVisit,
} from "./actions";

const roomId = "00000000-0000-4000-8000-000000000001";
const invitationId = "00000000-0000-4000-8000-000000000002";
const homeId = "00000000-0000-4000-8000-000000000003";
const visitId = "00000000-0000-4000-8000-000000000005";

describe("guest room actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadGuestInvitation.mockResolvedValue({
      id: invitationId,
      homeId,
      structured: {},
    });
    mocks.loadClock.mockResolvedValue(mocks.clock);
    mocks.schedulerForHome.mockReturnValue(mocks.scheduler);
    mocks.sql.mockResolvedValue([{ demo: true }]);
    mocks.resolveGuestInvitationAuthority.mockResolvedValue({
      id: invitationId,
      homeId,
      partyId: "00000000-0000-4000-8000-000000000004",
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
    expect(mocks.resolveGuestInvitationAuthority).toHaveBeenCalledWith({
      token: "guest-token",
    });
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
    expect(mocks.resolveGuestInvitationAuthority).toHaveBeenCalledWith({
      token: "guest-token",
    });
    expect(mocks.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        task: "guest_submit",
        roomIds: [roomId],
        overflowConsent: true,
      }),
    );
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/en/runs/run-1/status?returnTo=%2Fen%2Fg%2Fguest-token&token=guest-token",
    );
  });

  test("queues an ordinary guest change and preserves the token redirect", async () => {
    mocks.enqueue.mockResolvedValue({ runId: "run-change" });
    mocks.loadGuestInvitation.mockResolvedValue({
      id: invitationId,
      homeId,
      structured: {},
      visit: { id: visitId, status: "confirmed" },
    });
    const form = new FormData();
    form.set("token", "guest-token");
    form.set("locale", "es");
    form.set("message", "Necesitamos llegar un día después");

    await expect(requestGuestChange(form)).rejects.toMatchObject({
      digest: "NEXT_REDIRECT;test",
    });
    expect(mocks.enqueue).toHaveBeenCalledWith({
      task: "guest_change",
      homeId,
      visitId,
      message: "Necesitamos llegar un día después",
      locale: "es",
    });
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/es/runs/run-change/status?returnTo=%2Fes%2Fg%2Fguest-token&token=guest-token",
    );
  });

  test("answers a pending reconfirmation with a change request", async () => {
    mocks.enqueue.mockResolvedValue({ runId: "run-reconfirm-change" });
    mocks.loadGuestInvitation.mockResolvedValue({
      id: invitationId,
      homeId,
      structured: {},
      visit: { id: visitId, status: "reconfirm_pending" },
    });
    const form = new FormData();
    form.set("token", "guest-token");
    form.set("locale", "en");
    form.set("message", "We need different dates");

    await expect(requestGuestChange(form)).rejects.toMatchObject({
      digest: "NEXT_REDIRECT;test",
    });
    expect(mocks.enqueue).toHaveBeenCalledWith({
      task: "guest_reconfirm",
      homeId,
      visitId,
      answer: "change",
      message: "We need different dates",
    });
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/en/runs/run-reconfirm-change/status?returnTo=%2Fen%2Fg%2Fguest-token&token=guest-token",
    );
  });

  test("applies a guest reconfirmation and returns to the token route", async () => {
    mocks.loadGuestInvitation.mockResolvedValue({
      id: invitationId,
      homeId,
      structured: {},
      visit: { id: visitId, status: "reconfirm_pending" },
    });
    const form = new FormData();
    form.set("token", "guest-token");
    form.set("locale", "en");

    await expect(reconfirmGuest(form)).rejects.toMatchObject({
      digest: "NEXT_REDIRECT;test",
    });
    expect(mocks.applyGuestReconfirmation).toHaveBeenCalledWith(
      mocks.database,
      mocks.clock,
      mocks.scheduler,
      homeId,
      visitId,
      "yes",
    );
    expect(mocks.redirect).toHaveBeenCalledWith("/en/g/guest-token");
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
