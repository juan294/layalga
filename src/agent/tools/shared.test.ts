import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadCoreHouseState: vi.fn(),
  sql: vi.fn(),
  sqlClient: vi.fn(),
  stayApprovalHash: vi.fn(),
}));

vi.mock("@/core/booking/house-state", () => ({
  loadHouseState: mocks.loadCoreHouseState,
}));
vi.mock("@/core/booking/holds", () => ({
  stayApprovalHash: mocks.stayApprovalHash,
}));
vi.mock("@/core/db/client", () => ({
  sqlClient: mocks.sqlClient,
}));

import type { AgentDeps } from "../ports";
import {
  assertHomeAuthority,
  audit,
  homeIdForInvitation,
  homeIdForVisit,
  loadDraftForTool,
  loadHouseState,
  requireAuthority,
} from "./shared";

const homeId = "10000000-0000-4000-8000-000000000001";
const otherHomeId = "10000000-0000-4000-8000-000000000002";
const invitationId = "10000000-0000-4000-8000-000000000003";
const visitId = "10000000-0000-4000-8000-000000000004";

function deps(authority?: AgentDeps["authority"]): AgentDeps {
  return {
    db: vi.fn() as never,
    clock: { now: () => new Date("2026-09-10T10:00:00.000Z") },
    scheduler: { schedule: vi.fn(), cancel: vi.fn() },
    appUrl: "http://localhost:3008",
    locale: "en",
    authority,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sqlClient.mockReturnValue(mocks.sql);
  mocks.sql.mockResolvedValue([]);
  mocks.stayApprovalHash.mockReturnValue("approval-hash");
});

describe("agent tool scope helpers", () => {
  it("requires authority and rejects records from another home", () => {
    expect(() => requireAuthority(deps())).toThrow(
      "Agent task authority is required",
    );
    expect(() => assertHomeAuthority(deps({ homeId }), otherHomeId)).toThrow(
      "Record is outside the agent task home",
    );
    expect(() => assertHomeAuthority(deps({ homeId }), homeId)).not.toThrow();
  });

  it("resolves invitation and visit homes while enforcing task scope", async () => {
    mocks.sql.mockResolvedValueOnce([{ home_id: homeId }]);
    await expect(
      homeIdForInvitation(deps({ homeId, invitationId }), invitationId),
    ).resolves.toBe(homeId);

    mocks.sql.mockResolvedValueOnce([{ home_id: homeId }]);
    await expect(
      homeIdForVisit(deps({ homeId, visitId }), visitId),
    ).resolves.toBe(homeId);

    mocks.sql.mockResolvedValueOnce([]);
    await expect(homeIdForInvitation(deps({ homeId }), invitationId)).rejects.toThrow(
      `Invitation not found: ${invitationId}`,
    );
    mocks.sql.mockResolvedValueOnce([{ home_id: homeId }]);
    await expect(
      homeIdForVisit(deps({ homeId, visitId: "outside" }), visitId),
    ).rejects.toThrow("Visit is outside the agent task scope");
    mocks.sql.mockResolvedValueOnce([{ home_id: otherHomeId }]);
    await expect(homeIdForInvitation(deps({ homeId }), invitationId)).rejects.toThrow(
      "Record is outside the agent task home",
    );
  });

  it("audits the current run and rejects an out-of-scope audit", async () => {
    await audit(
      deps({ homeId }),
      homeId,
      { invocationState: { runId: "run-1" } },
      "tool_call",
      { name: "test", count: 1 },
    );
    expect(mocks.sql).toHaveBeenCalledOnce();
    expect(mocks.sql.mock.calls[0]?.slice(1)).toEqual([
      homeId,
      "run-1",
      "tool_call",
      JSON.stringify({ name: "test", count: 1 }),
    ]);

    await expect(
      audit(deps({ homeId }), otherHomeId, undefined, "tool_call", {}),
    ).rejects.toThrow("Record is outside the agent task home");
  });

  it("builds a trusted create-hold draft and removes model-controlled authority fields", async () => {
    mocks.sql.mockResolvedValueOnce([{ home_id: homeId }]);
    const submission = {
      stay: ["2026-09-12", "2026-09-14"] as [string, string],
      adults: 2,
      children: 1,
      pets: 0,
      specialRequests: ["ground floor"],
      roomIds: ["room-1"],
      overflowConsent: true,
    };
    const result = await loadDraftForTool(
      deps({ homeId, guestSubmission: submission }),
      "create_temporary_hold",
      {
        invitationId,
        approvedBy: "forged",
        roomIds: ["forged-room"],
        overflowConsent: false,
        adults: 99,
      },
    );

    expect(result).toEqual({
      homeId,
      draft: { ...submission },
      approvalStayHash: null,
      sanitizedInput: {
        invitationId,
        adults: 2,
        stay: submission.stay,
        children: 1,
        pets: 0,
        specialRequests: ["ground floor"],
      },
    });
  });

  it("loads an existing visit, combines requests, and restores approved overflow", async () => {
    mocks.sql.mockResolvedValueOnce([
      {
        home_id: homeId,
        stay_start: "2026-09-12",
        stay_end: "2026-09-14",
        adults: 2,
        children: 0,
        pets: 1,
        special_requests: ["ground floor"],
        approval_stay_hash: "approval-hash",
        room_ids: ["room-1"],
        uses_overflow: true,
      },
    ]);
    const result = await loadDraftForTool(
      deps({ homeId, visitId }),
      "confirm_visit",
      {
        visitId,
        adults: 3,
        specialRequests: ["ground floor", "late arrival"],
      },
    );

    expect(result.homeId).toBe(homeId);
    expect(result.draft).toEqual({
      visitId,
      stay: ["2026-09-12", "2026-09-14"],
      adults: 3,
      children: 0,
      pets: 1,
      specialRequests: ["ground floor", "late arrival"],
      roomIds: ["room-1"],
      overflowConsent: true,
    });
    expect(result.sanitizedInput).toMatchObject({
      visitId,
      adults: 3,
      specialRequests: ["ground floor", "late arrival"],
      roomIds: ["room-1"],
      overflowConsent: true,
    });
  });

  it("fails closed for missing visits, missing trusted submissions, and task-scope mismatches", async () => {
    await expect(
      loadDraftForTool(deps({ homeId }), "create_temporary_hold", {
        invitationId,
      }),
    ).rejects.toThrow("A trusted guest submission is required");

    mocks.sql.mockResolvedValueOnce([]);
    await expect(
      loadDraftForTool(deps({ homeId }), "confirm_visit", { visitId }),
    ).rejects.toThrow(`Visit not found: ${visitId}`);

    mocks.sql.mockResolvedValueOnce([{ home_id: homeId }]);
    await expect(
      loadDraftForTool(deps({ homeId, visitId: "outside" }), "confirm_visit", {
        visitId,
      }),
    ).rejects.toThrow("Visit is outside the agent task scope");
  });

  it("delegates house-state loading with the task clock", async () => {
    const state = { home: {}, rooms: [], visits: [] };
    mocks.loadCoreHouseState.mockResolvedValue(state);
    const taskDeps = deps({ homeId });
    const draft = {
      stay: ["2026-09-12", "2026-09-14"] as const,
      adults: 2,
      children: 0,
      pets: 0,
      specialRequests: [],
    };
    await expect(loadHouseState(taskDeps, homeId, draft)).resolves.toBe(state);
    expect(mocks.loadCoreHouseState).toHaveBeenCalledWith(
      taskDeps.db,
      taskDeps.clock,
      homeId,
      draft,
    );
  });
});
