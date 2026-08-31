import type { Agent } from "@strands-agents/sdk";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { HouseState } from "@/core/policy/evaluate-overlap";
import { listGuestRoomOptions } from "@/core/rooms/availability";

import type { AgentDeps } from "./deps";
import { audit, loadDraftForTool, loadHouseState } from "./tools/shared";

vi.mock("./tools/shared", () => ({
  audit: vi.fn(),
  loadDraftForTool: vi.fn(),
  loadHouseState: vi.fn(),
}));
vi.mock("@/core/rooms/availability", () => ({
  listGuestRoomOptions: vi.fn(),
}));

import { installPolicyHook } from "./policy-hook";

const draft = {
  stay: ["2026-10-10", "2026-10-13"] as const,
  adults: 2,
  children: 0,
  pets: 0,
  specialRequests: ["Ground-floor access"],
};

describe("policy hook approval refresh", () => {
  beforeEach(() => {
    vi.mocked(audit).mockReset().mockResolvedValue(undefined);
    vi.mocked(loadDraftForTool)
      .mockReset()
      .mockResolvedValue({
        homeId: "home-1",
        draft,
        approvalStayHash: null,
        sanitizedInput: { invitationId: "invitation-1" },
      });
    vi.mocked(loadHouseState).mockReset();
    vi.mocked(listGuestRoomOptions)
      .mockReset()
      .mockResolvedValue([
        {
          id: "room-1",
          guestLabel: "Horreu",
          floorLabel: "Ground",
          sleepingArrangement: "Double bed",
          overflowArrangement: null,
          standardCapacity: 2,
          maximumCapacity: 2,
          overflowPolicy: "none",
          displayOrder: 0,
        },
      ]);
  });

  test("rejects an approved draft when the refreshed house state now denies it", async () => {
    vi.mocked(loadHouseState)
      .mockResolvedValueOnce(houseState([]))
      .mockResolvedValueOnce(
        houseState([
          {
            id: "visit-2",
            stay: draft.stay,
            adults: 2,
            children: 0,
            pets: 0,
            status: "confirmed",
            roomIds: ["room-1"],
          },
        ]),
      );

    let hook: ((event: PolicyEvent) => Promise<void>) | undefined;
    const agent = {
      addHook: vi.fn((_eventType, callback) => {
        hook = callback as (event: PolicyEvent) => Promise<void>;
      }),
    } as unknown as Agent;
    installPolicyHook(agent, {} as AgentDeps);

    const event: PolicyEvent = {
      invocationState: {},
      toolUse: {
        name: "create_temporary_hold",
        input: { invitationId: "invitation-1" },
      },
      interrupt: vi.fn(() => ({ approved: true, hostId: "host-1" })),
    };
    await hook?.(event);

    expect(loadHouseState).toHaveBeenCalledTimes(2);
    expect(event.cancel).toMatch(/not enough free beds/i);
    expect(event.toolUse.input).not.toHaveProperty("approvedBy");
  });

  test("interrupts for the trusted overflow arrangement and resumes with host authority", async () => {
    const roomId = "00000000-0000-4000-8000-000000000777";
    const overflowDraft = {
      ...draft,
      adults: 4,
      specialRequests: [],
      roomIds: [roomId],
      overflowConsent: true,
    };
    vi.mocked(loadDraftForTool).mockResolvedValue({
      homeId: "home-1",
      draft: overflowDraft,
      approvalStayHash: null,
      sanitizedInput: { invitationId: "invitation-1" },
    });
    vi.mocked(listGuestRoomOptions).mockResolvedValue([
      {
        id: roomId,
        guestLabel: "Lower room",
        floorLabel: "Lower",
        sleepingArrangement: "One sofa bed",
        overflowArrangement: "One double air mattress",
        standardCapacity: 2,
        maximumCapacity: 4,
        overflowPolicy: "host_approval",
        displayOrder: 0,
      },
    ]);
    vi.mocked(loadHouseState).mockResolvedValue({
      home: { petsTogetherAllowed: false, maxFamiliesWithChildren: 1 },
      rooms: [{ id: roomId, name: "Lower room", beds: 4 }],
      visits: [],
    });

    let hook: ((event: PolicyEvent) => Promise<void>) | undefined;
    const agent = {
      addHook: vi.fn((_eventType, callback) => {
        hook = callback as (event: PolicyEvent) => Promise<void>;
      }),
    } as unknown as Agent;
    installPolicyHook(agent, {} as AgentDeps);
    const event: PolicyEvent = {
      invocationState: {},
      toolUse: {
        name: "create_temporary_hold",
        input: { invitationId: "invitation-1" },
      },
      interrupt: vi.fn(() => ({ approved: true, hostId: "host-1" })),
    };

    await hook?.(event);

    expect(event.interrupt).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "host_decision",
        reason: expect.objectContaining({
          reason: "overflow",
          overflowArrangements: ["One double air mattress"],
        }),
      }),
    );
    expect(event.toolUse.input).toMatchObject({ approvedBy: "host-1" });
  });
});

interface PolicyEvent {
  invocationState: Record<string, unknown>;
  toolUse: { name: string; input: Record<string, unknown> };
  interrupt: ReturnType<typeof vi.fn>;
  cancel?: string;
}

function houseState(visits: HouseState["visits"]): HouseState {
  return {
    home: { petsTogetherAllowed: false, maxFamiliesWithChildren: 1 },
    rooms: [{ id: "room-1", name: "Horreu", beds: 2 }],
    visits,
  };
}
