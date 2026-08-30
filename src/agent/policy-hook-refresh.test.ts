import type { Agent } from "@strands-agents/sdk";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { HouseState } from "@/core/policy/evaluate-overlap";

import type { AgentDeps } from "./deps";
import { audit, loadDraftForTool, loadHouseState } from "./tools/shared";

vi.mock("./tools/shared", () => ({
  audit: vi.fn(),
  loadDraftForTool: vi.fn(),
  loadHouseState: vi.fn(),
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
