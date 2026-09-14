import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DatabaseClient } from "@/core/db/client";

import { CancellationChangedError } from "./cancellation-error";

const mocks = vi.hoisted(() => ({
  cancelVisitInTransaction: vi.fn(),
}));

vi.mock("./holds", () => ({
  cancelVisitInTransaction: mocks.cancelVisitInTransaction,
}));

import { withdrawInvitation } from "./cancellation";

const homeId = "11111111-1111-4111-8111-111111111111";
const invitationId = "22222222-2222-4222-8222-222222222222";
const partyId = "33333333-3333-4333-8333-333333333333";
const hostId = "44444444-4444-4444-8444-444444444444";
const visitId = "55555555-5555-4555-8555-555555555555";
const stay = ["2026-10-01", "2026-10-04"] as const;

function fakeDatabase(options: {
  invitation?: { party_id: string; status: string };
  host?: boolean;
  visits?: { id: string; start: string; end: string }[];
}) {
  const transaction = vi.fn(async (strings: TemplateStringsArray) => {
    const query = strings.join(" ");
    if (query.includes("select pg_advisory_xact_lock")) return [];
    if (query.includes("select party_id, status")) {
      return options.invitation ? [options.invitation] : [];
    }
    if (query.includes("select id from public.hosts")) {
      return options.host ? [{ id: hostId }] : [];
    }
    if (query.includes("select id, lower(stay)")) return options.visits ?? [];
    return [];
  });
  const database = vi.fn();
  Object.assign(database, {
    begin: vi.fn(async (callback: (tx: typeof transaction) => unknown) =>
      callback(transaction),
    ),
  });
  return {
    database: database as unknown as DatabaseClient,
    transaction,
  };
}

const guestInput = {
  homeId,
  invitationId,
  actor: { kind: "guest" as const, partyId },
  expectedVisitId: visitId,
  expectedStay: stay,
};

describe("withdrawInvitation unit boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("authorizes a guest, cancels the visit, and removes its remote schedules", async () => {
    const fake = fakeDatabase({
      invitation: { party_id: partyId, status: "submitted" },
      visits: [{ id: visitId, start: stay[0], end: stay[1] }],
    });
    mocks.cancelVisitInTransaction.mockResolvedValue(["schedule-1", "schedule-2"]);
    const scheduler = { schedule: vi.fn(), cancel: vi.fn() };

    await expect(withdrawInvitation(fake.database, guestInput, scheduler)).resolves.toBeUndefined();

    expect(mocks.cancelVisitInTransaction).toHaveBeenCalledWith(
      fake.transaction,
      visitId,
    );
    expect(scheduler.cancel).toHaveBeenCalledWith("schedule-1");
    expect(scheduler.cancel).toHaveBeenCalledWith("schedule-2");
    expect(fake.transaction).toHaveBeenCalledTimes(7);
  });

  it("authorizes a host and keeps database cancellation authoritative when a scheduler fails", async () => {
    const fake = fakeDatabase({
      invitation: { party_id: partyId, status: "submitted" },
      host: true,
      visits: [{ id: visitId, start: stay[0], end: stay[1] }],
    });
    mocks.cancelVisitInTransaction.mockResolvedValue(["schedule-fails"]);
    const scheduler = {
      schedule: vi.fn(),
      cancel: vi.fn().mockRejectedValue(new Error("remote unavailable")),
    };
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      await expect(
        withdrawInvitation(fake.database, {
          ...guestInput,
          actor: { kind: "host", hostId },
        }, scheduler),
      ).resolves.toBeUndefined();
      expect(error).toHaveBeenCalledWith("[CANCEL_SCHEDULE_FAILED]", {
        error: "Error",
      });
    } finally {
      error.mockRestore();
    }
    expect(mocks.cancelVisitInTransaction).toHaveBeenCalledWith(
      fake.transaction,
      visitId,
    );
  });

  it("returns early for an already cancelled invitation", async () => {
    const fake = fakeDatabase({
      invitation: { party_id: partyId, status: "cancelled" },
    });

    await expect(withdrawInvitation(fake.database, guestInput)).resolves.toBeUndefined();
    expect(fake.transaction).toHaveBeenCalledTimes(2);
    expect(mocks.cancelVisitInTransaction).not.toHaveBeenCalled();
  });

  it("rejects invitations outside the actor scope", async () => {
    await expect(
      withdrawInvitation(fakeDatabase({}).database, guestInput),
    ).rejects.toThrow("Invitation is outside your household");

    await expect(
      withdrawInvitation(
        fakeDatabase({ invitation: { party_id: "66666666-6666-4666-8666-666666666666", status: "submitted" } }).database,
        guestInput,
      ),
    ).rejects.toThrow("Invitation is outside your access");

    await expect(
      withdrawInvitation(
        fakeDatabase({ invitation: { party_id: partyId, status: "submitted" }, host: false }).database,
        { ...guestInput, actor: { kind: "host", hostId }, expectedVisitId: null, expectedStay: null },
      ),
    ).rejects.toThrow("Host is outside this household");
  });

  it("rejects when the expected visit changed", async () => {
    const fake = fakeDatabase({
      invitation: { party_id: partyId, status: "submitted" },
      visits: [{ id: visitId, start: stay[0], end: "2026-10-05" }],
    });

    await expect(withdrawInvitation(fake.database, guestInput)).rejects.toBeInstanceOf(
      CancellationChangedError,
    );
  });
});
