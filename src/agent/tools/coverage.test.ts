import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const sql = Object.assign(vi.fn(), { begin: vi.fn() });
  return {
    audit: vi.fn(),
    confirmVisit: vi.fn(),
    createTemporaryHold: vi.fn(),
    evaluateOverlap: vi.fn(),
    homeIdForInvitation: vi.fn(),
    homeIdForVisit: vi.fn(),
    listGuestSafeRoomInventory: vi.fn(),
    loadHouseState: vi.fn(),
    prepareRoomActionProposal: vi.fn(),
    requireAuthority: vi.fn(),
    sql,
    sqlClient: vi.fn(),
    transaction: vi.fn(),
    rescheduleVisit: vi.fn(),
  };
});

vi.mock("@/core/booking/holds", () => ({
  confirmVisit: mocks.confirmVisit,
  createTemporaryHold: mocks.createTemporaryHold,
  rescheduleVisit: mocks.rescheduleVisit,
}));
vi.mock("@/core/db/client", () => ({
  sqlClient: mocks.sqlClient,
}));
vi.mock("@/core/policy/evaluate-overlap", () => ({
  evaluateOverlap: mocks.evaluateOverlap,
}));
vi.mock("@/core/rooms/availability", () => ({
  listGuestSafeRoomInventory: mocks.listGuestSafeRoomInventory,
}));
vi.mock("@/core/rooms/proposals", () => ({
  MAX_PROPOSAL_ROOMS: 20,
  MAX_PROPOSAL_SUMMARY_LENGTH: 500,
  prepareRoomActionProposal: mocks.prepareRoomActionProposal,
}));
vi.mock("./shared", () => ({
  audit: mocks.audit,
  homeIdForInvitation: mocks.homeIdForInvitation,
  homeIdForVisit: mocks.homeIdForVisit,
  loadHouseState: mocks.loadHouseState,
  requireAuthority: mocks.requireAuthority,
}));

import type { AgentDeps } from "../ports";
import { confirmVisitTool } from "./confirm-visit";
import { createTemporaryHoldTool } from "./create-temporary-hold";
import { evaluateOverlapTool } from "./evaluate-overlap";
import { findVisitOptionsTool } from "./find-visit-options";
import { listGuestRoomsTool } from "./list-guest-rooms";
import {
  assertChaseRecipient,
  assertGuestNotificationChannel,
  assertReconfirmationRecipientKind,
  notifyTool,
} from "./notify";
import { prepareCancellationTool } from "./prepare-cancellation";
import { prepareRoomActionTool } from "./prepare-room-action";
import { rescheduleVisitTool } from "./reschedule-visit";

const homeId = "10000000-0000-4000-8000-000000000001";
const invitationId = "10000000-0000-4000-8000-000000000002";
const visitId = "10000000-0000-4000-8000-000000000003";
const context = { invocationState: { runId: "run-1" } } as never;

function deps(overrides: Partial<AgentDeps> = {}): AgentDeps {
  return {
    db: vi.fn() as never,
    clock: { now: () => new Date("2026-09-10T10:00:00.000Z") },
    scheduler: { schedule: vi.fn(), cancel: vi.fn() },
    appUrl: "http://localhost:3008",
    locale: "en",
    ...overrides,
  };
}

describe("agent tool adapters", () => {
  it("evaluates a proposed overlap and audits the decision", async () => {
    const verdict = {
      decision: "allow" as const,
      reason: undefined,
      allocation: [{ id: "room-1", name: "Guest room", beds: 2 }],
    };
    mocks.homeIdForInvitation.mockResolvedValue(homeId);
    mocks.loadHouseState.mockResolvedValue({ rooms: [], visits: [] });
    mocks.evaluateOverlap.mockReturnValue(verdict);

    await expect(
      evaluateOverlapTool(deps()).invoke(
        {
          invitationId,
          stay: ["2026-09-12", "2026-09-14"],
          adults: 2,
          children: 0,
          pets: 0,
          specialRequests: [],
        },
        context,
      ),
    ).resolves.toEqual(verdict);
    expect(mocks.loadHouseState).toHaveBeenCalledWith(
      expect.anything(),
      homeId,
      expect.objectContaining({ adults: 2 }),
    );
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.anything(),
      homeId,
      context,
      "tool_call",
      { name: "evaluate_overlap", decision: "allow" },
    );
  });

  it("delegates confirmation and scopes its audit to the visit", async () => {
    const visit = { visitId, allocation: [] };
    mocks.confirmVisit.mockResolvedValue(visit);
    mocks.homeIdForVisit.mockResolvedValue(homeId);

    await expect(
      confirmVisitTool(deps()).invoke({ visitId, approvedBy: homeId }, context),
    ).resolves.toEqual(visit);
    expect(mocks.confirmVisit).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      visitId,
      homeId,
      expect.anything(),
    );
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.anything(),
      homeId,
      context,
      "tool_call",
      { name: "confirm_visit", visitId },
    );
  });

  it("uses trusted guest submission fields when creating a temporary hold", async () => {
    const allocation = [{ id: "room-1", name: "Guest room", beds: 2 }];
    mocks.createTemporaryHold.mockResolvedValue({
      visitId,
      allocation,
    });
    mocks.homeIdForInvitation.mockResolvedValue(homeId);
    const clock = { now: () => new Date("2026-09-10T10:00:00.000Z") };
    const guestSubmission = {
      stay: ["2026-09-12", "2026-09-14"] as [string, string],
      adults: 2,
      children: 1,
      pets: 1,
      specialRequests: ["ground floor"],
      notes: "  trusted note  ",
      roomIds: ["room-1"],
      overflowConsent: true,
    };

    await expect(
      createTemporaryHoldTool(
        deps({ clock, authority: { homeId, guestSubmission } }),
      ).invoke(
        {
          invitationId,
          stay: guestSubmission.stay,
          adults: 9,
          children: 0,
          pets: 0,
          specialRequests: [],
        },
        context,
      ),
    ).resolves.toEqual({
      visitId,
      rooms: allocation,
      holdExpiresAt: "2026-09-12T10:00:00.000Z",
    });
    expect(mocks.createTemporaryHold).toHaveBeenCalledWith(
      expect.anything(),
      clock,
      expect.objectContaining({
        invitationId,
        adults: 9,
        guestNotes: "  trusted note  ",
        roomIds: ["room-1"],
        overflowConsent: true,
      }),
    );
  });

  it("enumerates only allowed candidate stays and reports anonymous overlaps", async () => {
    mocks.sqlClient.mockReturnValue(mocks.sql);
    mocks.sql.mockResolvedValue([
      { structured: { adults: "invalid", children: 1, pets: 0 } },
    ]);
    mocks.homeIdForInvitation.mockResolvedValue(homeId);
    mocks.loadHouseState.mockResolvedValue({
      rooms: [],
      home: { petsTogetherAllowed: true, maxFamiliesWithChildren: 2 },
      visits: [
        {
          id: "other-visit",
          stay: ["2026-09-12", "2026-09-14"],
          adults: 2,
          children: 0,
          pets: 1,
          status: "confirmed",
          roomIds: [],
        },
      ],
    });
    mocks.evaluateOverlap.mockImplementation((draft: { stay: [string, string] }) =>
      draft.stay[0] === "2026-09-12"
        ? {
            decision: "allow",
            reason: undefined,
            allocation: [{ id: "room-1", name: "Guest room", beds: 2 }],
          }
        : { decision: "deny", reason: "beds", allocation: [] },
    );

    await expect(
      findVisitOptionsTool(deps({ authority: { homeId } })).invoke(
        {
          invitationId,
          window: { from: "2026-09-10", to: "2026-09-16" },
          nights: 2,
        },
        context,
      ),
    ).resolves.toEqual({
      candidates: [
        {
          stay: ["2026-09-12", "2026-09-14"],
          rooms: [{ id: "room-1", name: "Guest room", beds: 2 }],
          overlaps: ["another party: 2 adults, 0 children, 1 pets"],
        },
      ],
    });
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.anything(),
      homeId,
      context,
      "tool_call",
      { name: "find_visit_options", candidateCount: 1 },
    );
  });

  it("bounds the guest-safe inventory and marks truncation", async () => {
    const available = Array.from({ length: 21 }, (_, index) => ({
      id: `room-${index}`,
      guestLabel: `Room ${index}`,
      floorLabel: "Ground",
      sleepingArrangement: "Two beds",
      overflowArrangement: null,
      standardCapacity: 2,
      maximumCapacity: 2,
      overflowPolicy: "none" as const,
      displayOrder: index,
      inventoryState: "available" as const,
    }));
    mocks.requireAuthority.mockReturnValue({ homeId });
    mocks.listGuestSafeRoomInventory.mockResolvedValue(available);

    const result = await listGuestRoomsTool(deps({ authority: { homeId } })).invoke(
      {},
      context,
    );

    expect(result).toMatchObject({ truncated: true });
    expect(result.rooms).toHaveLength(20);
    expect(result.rooms[0]).toEqual({
      id: "room-0",
      guestLabel: "Room 0",
      floorLabel: "Ground",
      sleepingArrangement: "Two beds",
      overflowArrangement: null,
      standardCapacity: 2,
      maximumCapacity: 2,
      overflowPolicy: "none",
      displayOrder: 0,
      inventoryState: "available",
    });
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.anything(),
      homeId,
      context,
      "tool_call",
      { name: "list_guest_rooms", roomCount: 20 },
    );
  });

  it("prepares a cancellation review without changing the visit", async () => {
    mocks.requireAuthority.mockReturnValue({ homeId, visitId });
    mocks.homeIdForVisit.mockResolvedValue(homeId);
    mocks.sql.mockResolvedValue([
      { start: "2026-09-12", end: "2026-09-14", status: "confirmed" },
    ]);

    const result = await prepareCancellationTool(
      deps({ authority: { homeId, visitId }, locale: "es" }),
    ).invoke({ visitId }, context);

    expect(result).toMatchObject({
      cancellationRequested: true,
      visit: { id: visitId, stay: ["2026-09-12", "2026-09-14"] },
    });
    expect(result.nextStep).toContain("No se ha cambiado nada.");
    expect(mocks.audit).toHaveBeenCalled();
  });

  it("prepares a host room proposal with the trusted run context", async () => {
    const proposal = {
      proposalId: "10000000-0000-4000-8000-000000000005",
      kind: "private_block" as const,
      stay: ["2026-09-12", "2026-09-14"] as [string, string],
      roomIds: ["10000000-0000-4000-8000-000000000006"],
      summary: "Family room use",
      status: "pending" as const,
    };
    mocks.requireAuthority.mockReturnValue({ homeId, hostId: invitationId });
    mocks.prepareRoomActionProposal.mockResolvedValue(proposal);

    await expect(
      prepareRoomActionTool(
        deps({ authority: { homeId, hostId: invitationId } }),
      ).invoke(
        {
          kind: "private_block",
          stay: proposal.stay,
          roomIds: proposal.roomIds,
          summary: proposal.summary,
        },
        context,
      ),
    ).resolves.toEqual(proposal);
    expect(mocks.prepareRoomActionProposal).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ homeId, hostId: invitationId, runId: "run-1" }),
    );
  });

  it("reschedules a visit and records the visit scope", async () => {
    const result = { visitId, status: "confirmed", allocation: [] };
    mocks.rescheduleVisit.mockResolvedValue(result);
    mocks.homeIdForVisit.mockResolvedValue(homeId);

    await expect(
      rescheduleVisitTool(deps()).invoke(
        { visitId, stay: ["2026-09-15", "2026-09-17"] },
        context,
      ),
    ).resolves.toEqual(result);
    expect(mocks.rescheduleVisit).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ visitId }),
      expect.anything(),
    );
  });

  it("writes a host notification through the transaction boundary", async () => {
    mocks.requireAuthority.mockReturnValue({ homeId });
    mocks.transaction.mockResolvedValue([]);
    mocks.transaction
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: invitationId }])
      .mockResolvedValueOnce([{ id: visitId }])
      .mockResolvedValueOnce([]);
    mocks.sql.begin.mockImplementation((callback: (sql: unknown) => unknown) =>
      callback(mocks.transaction),
    );
    mocks.sqlClient.mockReturnValue(mocks.sql);

    await expect(
      notifyTool(deps({ authority: { homeId } })).invoke(
        {
          recipientKind: "host",
          recipientId: invitationId,
          kind: "hold_confirmed",
          bodyEn: "A visit was confirmed.",
          bodyEs: "Se ha confirmado una visita.",
        },
        context,
      ),
    ).resolves.toEqual({ notificationId: visitId });
    expect(mocks.transaction).toHaveBeenCalled();
  });

  it("validates reconfirmation recipients and resolves an idempotent chase", async () => {
    expect(() => assertReconfirmationRecipientKind("reconfirm_chase", "host")).toThrow();
    expect(() => assertReconfirmationRecipientKind("reconfirm_escalation", "party")).toThrow();
    expect(() => assertGuestNotificationChannel("hold_confirmed", "party")).toThrow();
    expect(() => assertChaseRecipient("reconfirm_chase", invitationId, visitId)).toThrow();

    mocks.requireAuthority.mockReturnValue({ homeId, visitId, jobId: invitationId });
    mocks.transaction.mockReset();
    mocks.transaction
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: visitId }])
      .mockResolvedValueOnce([{ id: visitId, party_id: invitationId }])
      .mockResolvedValueOnce([{ id: invitationId }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: visitId }])
      .mockResolvedValueOnce([]);
    mocks.sql.begin.mockReset();
    mocks.sql.begin.mockImplementation((callback: (sql: unknown) => unknown) =>
      callback(mocks.transaction),
    );
    mocks.sqlClient.mockReturnValue(mocks.sql);

    await expect(
      notifyTool(deps({ authority: { homeId, visitId, jobId: invitationId } })).invoke(
        {
          recipientKind: "party",
          recipientId: invitationId,
          visitId,
          scheduledJobId: invitationId,
          kind: "reconfirm_chase",
          bodyEn: "Please confirm.",
          bodyEs: "Confirma, por favor.",
        },
        context,
      ),
    ).resolves.toEqual({ notificationId: visitId });
  });
});
