import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  withdraw: vi.fn(),
  invitation: vi.fn(),
  session: vi.fn(),
  user: vi.fn(),
  claim: vi.fn(),
  host: vi.fn(),
  sql: vi.fn(),
  redirect: vi.fn(() => {
    throw { digest: "NEXT_REDIRECT;test" };
  }),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/core/booking/cancellation", () => ({
  withdrawInvitation: mocks.withdraw,
}));
vi.mock("@/core/db/client", () => ({
  getDatabaseConnection: () => ({ db: {}, sql: mocks.sql }),
  sqlClient: () => mocks.sql,
}));
vi.mock("@/core/booking/guest-invitation", () => ({
  loadGuestInvitation: mocks.invitation,
}));
vi.mock("@/lib/auth/current-guest", () => ({
  getCurrentGuestInvitation: mocks.session,
}));
vi.mock("@/lib/auth/current-host", () => ({ requireHost: mocks.host }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: mocks.user } }),
}));
vi.mock("@/lib/auth/guest-account", () => ({
  partyIsClaimedByUser: mocks.claim,
}));
vi.mock("@/agent/scheduler", () => ({ schedulerForHome: () => ({}) }));

import { cancelGuest } from "@/app/[locale]/g/[token]/actions";
import { cancelGuestSession } from "@/app/[locale]/guest/actions";
import { cancelAccountVisit } from "@/app/[locale]/visits/actions";
import { cancelHostInvitation } from "@/app/[locale]/(host)/actions";
import { CancellationChangedError } from "./cancellation-error";

const homeId = "10000000-0000-4000-8000-000000000001";
const invitationId = "10000000-0000-4000-8000-000000000002";
const partyId = "10000000-0000-4000-8000-000000000003";
const visitId = "10000000-0000-4000-8000-000000000004";
const hostId = "10000000-0000-4000-8000-000000000005";

function form() {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    locale: "en",
    token: "private",
    invitationId,
    confirmed: "yes",
    expectedVisitId: visitId,
    expectedStay: "2026-10-02|2026-10-04",
    homeId: "forged",
    partyId: "forged",
  }))
    data.set(key, value);
  return data;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.invitation.mockResolvedValue({ id: invitationId, homeId, partyId });
  mocks.session.mockResolvedValue({ invitationId, homeId, partyId });
  mocks.user.mockResolvedValue({
    data: { user: { id: "authenticated-user" } },
  });
  mocks.claim.mockResolvedValue(true);
  mocks.host.mockResolvedValue({ id: hostId, homeId });
  mocks.sql.mockResolvedValue([
    {
      demo: true,
      home_id: homeId,
      invitation_id: invitationId,
      party_id: partyId,
    },
  ]);
});

describe("explicit cancellation authorities", () => {
  it.each([
    [cancelGuest, "/en/g/private?cancel=changed#cancel-request"],
    [cancelGuestSession, "/en/guest?cancel=changed#cancel-request"],
    [
      cancelAccountVisit,
      `/en/visits?cancel=changed&visit=${visitId}#cancel-${visitId}`,
    ],
    [
      cancelHostInvitation,
      `/en?cancel=changed&invitation=${invitationId}#cancel-${invitationId}`,
    ],
  ] as const)(
    "returns stale reviews to fresh localized details",
    async (action, destination) => {
      mocks.withdraw.mockRejectedValueOnce(new CancellationChangedError());
      const data = form();
      if (action === cancelAccountVisit) {
        data.delete("invitationId");
        mocks.sql.mockResolvedValueOnce([
          {
            home_id: homeId,
            invitation_id: invitationId,
            party_id: partyId,
            demo: true,
          },
        ]);
        mocks.sql.mockResolvedValueOnce([{ id: visitId }]);
      }
      await expect(action(data)).rejects.toMatchObject({
        digest: "NEXT_REDIRECT;test",
      });
      expect(mocks.redirect).toHaveBeenCalledWith(destination);
    },
  );
  it.each([cancelGuest, cancelGuestSession, cancelAccountVisit])(
    "uses authenticated guest authority and requires confirmation",
    async (action) => {
      const unconfirmed = form();
      unconfirmed.delete("confirmed");
      await expect(action(unconfirmed)).rejects.toThrow("confirm");
      expect(mocks.withdraw).not.toHaveBeenCalled();
      await expect(action(form())).rejects.toMatchObject({
        digest: "NEXT_REDIRECT;test",
      });
      expect(mocks.withdraw).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
          homeId,
          invitationId,
          actor: { kind: "guest", partyId },
          expectedVisitId: visitId,
        }),
        {},
      );
    },
  );
  it("lets an authenticated party withdraw an invitation before a visit exists", async () => {
    const data = form();
    data.set("expectedVisitId", "");
    data.set("expectedStay", "");
    await expect(cancelAccountVisit(data)).rejects.toMatchObject({
      digest: "NEXT_REDIRECT;test",
    });
    expect(mocks.withdraw).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        invitationId,
        expectedVisitId: null,
        actor: { kind: "guest", partyId },
      }),
      {},
    );
  });

  it("returns a changed account invitation to its own fresh review", async () => {
    const data = form();
    data.set("expectedVisitId", "");
    data.set("expectedStay", "");
    mocks.withdraw.mockRejectedValueOnce(new CancellationChangedError());
    mocks.sql.mockResolvedValueOnce([
      {
        home_id: homeId,
        invitation_id: invitationId,
        party_id: partyId,
        demo: true,
      },
    ]);
    mocks.sql.mockResolvedValueOnce([]);
    await expect(cancelAccountVisit(data)).rejects.toMatchObject({
      digest: "NEXT_REDIRECT;test",
    });
    expect(mocks.redirect).toHaveBeenCalledWith(
      `/en/visits?cancel=changed&invitation=${invitationId}#cancel-${invitationId}`,
    );
  });

  it("opens the newly created visit when a pending account invitation changes during review", async () => {
    const data = form();
    data.set("expectedVisitId", "");
    data.set("expectedStay", "");
    mocks.withdraw.mockRejectedValueOnce(new CancellationChangedError());
    mocks.sql.mockResolvedValueOnce([
      {
        home_id: homeId,
        invitation_id: invitationId,
        party_id: partyId,
        demo: true,
      },
    ]);
    mocks.sql.mockResolvedValueOnce([{ id: visitId }]);
    await expect(cancelAccountVisit(data)).rejects.toMatchObject({
      digest: "NEXT_REDIRECT;test",
    });
    expect(mocks.redirect).toHaveBeenCalledWith(
      `/en/visits?cancel=changed&visit=${visitId}#cancel-${visitId}`,
    );
    expect(mocks.sql.mock.calls[1]?.slice(1)).toEqual([invitationId, homeId]);
  });

  it("rejects account visits belonging to another user", async () => {
    mocks.claim.mockResolvedValue(false);
    await cancelAccountVisit(form());
    expect(mocks.withdraw).not.toHaveBeenCalled();
  });
  it("uses the authenticated host's home and identity", async () => {
    await cancelHostInvitation(form());
    expect(mocks.withdraw).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        homeId,
        invitationId,
        actor: { kind: "host", hostId },
      }),
      {},
    );
  });
});
