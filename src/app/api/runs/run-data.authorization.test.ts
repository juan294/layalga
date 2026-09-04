import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sql: vi.fn(),
  findInvitationByToken: vi.fn(),
  getCurrentHost: vi.fn(),
  getCurrentGuestInvitation: vi.fn(),
  database: {},
}));

vi.mock("@/core/db/client", () => ({
  getDatabaseConnection: () => ({ db: mocks.database }),
  sqlClient: () => mocks.sql,
}));
vi.mock("@/core/booking/invitations", () => ({
  findInvitationByToken: mocks.findInvitationByToken,
}));
vi.mock("@/lib/auth/current-host", () => ({
  getCurrentHost: mocks.getCurrentHost,
}));
vi.mock("@/lib/auth/current-guest", () => ({
  getCurrentGuestInvitation: mocks.getCurrentGuestInvitation,
}));

import { getAuthorizedRunSnapshot } from "./run-data";

const runId = "00000000-0000-4000-8000-000000000501";
const homeId = "00000000-0000-4000-8000-000000000502";
const invitationId = "00000000-0000-4000-8000-000000000503";

describe("getAuthorizedRunSnapshot authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sql.mockResolvedValue([
      {
        id: runId,
        home_id: homeId,
        session_id: `inv_${invitationId}`,
        status: "completed",
        result: { summary: "The booking was saved", executedOn: "local" },
        finished_at: "2026-09-04T08:30:00.000Z",
        event_kind: null,
        event_payload: null,
        event_created_at: null,
      },
    ]);
    mocks.findInvitationByToken.mockResolvedValue(null);
    mocks.getCurrentHost.mockResolvedValue(null);
    mocks.getCurrentGuestInvitation.mockResolvedValue(null);
  });

  it("authorizes a run with its invitation token", async () => {
    mocks.findInvitationByToken.mockResolvedValue({
      id: invitationId,
      homeId,
    });

    await expect(
      getAuthorizedRunSnapshot(runId, "guest-token"),
    ).resolves.toEqual(expectedSnapshot());
    expect(mocks.findInvitationByToken).toHaveBeenCalledWith(
      mocks.database,
      "guest-token",
    );
    expect(mocks.getCurrentHost).not.toHaveBeenCalled();
    expect(mocks.getCurrentGuestInvitation).not.toHaveBeenCalled();
  });

  it("authorizes a run for the current host", async () => {
    mocks.getCurrentHost.mockResolvedValue({ homeId });

    await expect(getAuthorizedRunSnapshot(runId)).resolves.toEqual(
      expectedSnapshot(),
    );
    expect(mocks.getCurrentGuestInvitation).not.toHaveBeenCalled();
  });

  it("authorizes the current guest's invitation run", async () => {
    mocks.getCurrentGuestInvitation.mockResolvedValue({
      invitationId,
      homeId,
    });

    await expect(getAuthorizedRunSnapshot(runId)).resolves.toEqual(
      expectedSnapshot(),
    );
  });

  it.each([
    ["another invitation", "00000000-0000-4000-8000-000000000504", homeId],
    [
      "another home",
      invitationId,
      "00000000-0000-4000-8000-000000000505",
    ],
  ])("rejects a guest session for %s", async (_label, guestId, guestHomeId) => {
    mocks.getCurrentGuestInvitation.mockResolvedValue({
      invitationId: guestId,
      homeId: guestHomeId,
    });

    await expect(getAuthorizedRunSnapshot(runId)).resolves.toBeNull();
  });
});

function expectedSnapshot() {
  return {
    id: runId,
    status: "completed",
    summary: "The booking was saved",
    finishedAt: "2026-09-04T08:30:00.000Z",
    executedOn: "local",
    events: [],
  };
}
