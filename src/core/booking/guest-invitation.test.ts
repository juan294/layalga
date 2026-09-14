import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findInvitationById: vi.fn(),
  findInvitationByToken: vi.fn(),
  sql: vi.fn(),
}));

vi.mock("@/core/booking/invitations", () => ({
  findInvitationById: mocks.findInvitationById,
  findInvitationByToken: mocks.findInvitationByToken,
}));
vi.mock("@/core/db/client", () => ({
  getDatabaseConnection: () => ({ db: {}, sql: mocks.sql }),
  sqlClient: () => mocks.sql,
}));

import {
  loadGuestInvitation,
  partyDefaults,
  resolveGuestInvitationAuthority,
} from "./guest-invitation";

const invitation = {
  id: "10000000-0000-4000-8000-000000000001",
  homeId: "10000000-0000-4000-8000-000000000002",
  hostId: "10000000-0000-4000-8000-000000000003",
  partyId: "10000000-0000-4000-8000-000000000004",
  partyName: "The Parkers",
  partyLocale: "en" as const,
  rawMessage: "Come visit",
  structured: { adults: 2 },
  status: "sent" as const,
  linkTokenExpiresAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findInvitationById.mockResolvedValue(invitation);
  mocks.findInvitationByToken.mockResolvedValue(invitation);
  mocks.sql.mockResolvedValue([]);
});

describe("guest invitation projection", () => {
  it("uses safe numeric party defaults", () => {
    expect(
      partyDefaults({ adults: 3, children: -1, pets: 1.5 }),
    ).toEqual({ adults: 3, children: 0, pets: 0 });
    expect(partyDefaults({})).toEqual({ adults: 1, children: 0, pets: 0 });
  });

  it("resolves both guest identity forms and returns null for a missing invitation", async () => {
    await expect(
      resolveGuestInvitationAuthority({ token: "private-token" }),
    ).resolves.toEqual({
      id: invitation.id,
      homeId: invitation.homeId,
      partyId: invitation.partyId,
    });
    expect(mocks.findInvitationByToken).toHaveBeenCalledWith({}, "private-token");

    await expect(
      resolveGuestInvitationAuthority({ invitationId: invitation.id }),
    ).resolves.toMatchObject({ id: invitation.id });
    expect(mocks.findInvitationById).toHaveBeenCalledWith({}, invitation.id);

    mocks.findInvitationById.mockResolvedValueOnce(null);
    await expect(
      resolveGuestInvitationAuthority({ invitationId: "missing" }),
    ).resolves.toBeNull();
  });

  it("projects a visit and chooses the localized reconfirmation message", async () => {
    mocks.sql
      .mockResolvedValueOnce([
        {
          id: "10000000-0000-4000-8000-000000000005",
          stay_start: "2026-09-12",
          stay_end: "2026-09-14",
          adults: 2,
          children: 1,
          pets: 0,
          status: "reconfirm_pending",
          guest_notes: "Bring a cot",
          room_count: 1,
          room_labels: ["Garden room"],
          has_overlap: true,
          hold_expires_at: "2026-09-11T10:00:00.000Z",
          hold_expired: false,
          pre_arrival: true,
          timezone: "Europe/Madrid",
        },
      ])
      .mockResolvedValueOnce([{ body_en: "Please confirm", body_es: "Confirma" }]);

    await expect(
      loadGuestInvitation({ token: "private-token" }, "es"),
    ).resolves.toEqual({
      id: invitation.id,
      homeId: invitation.homeId,
      partyId: invitation.partyId,
      partyName: invitation.partyName,
      partyLocale: "en",
      structured: invitation.structured,
      visit: {
        id: "10000000-0000-4000-8000-000000000005",
        stay: ["2026-09-12", "2026-09-14"],
        adults: 2,
        children: 1,
        pets: 0,
        status: "reconfirm_pending",
        guestNotes: "Bring a cot",
        roomCount: 1,
        roomLabels: ["Garden room"],
        hasOverlap: true,
        chaseMessage: "Confirma",
        holdExpiresAt: "2026-09-11T10:00:00.000Z",
        holdExpired: false,
        preArrival: true,
        timeZone: "Europe/Madrid",
      },
    });
  });

  it("returns a null visit and treats non-object structured data as empty", async () => {
    mocks.findInvitationById.mockResolvedValueOnce({
      ...invitation,
      structured: ["not-an-object"],
    });
    await expect(
      loadGuestInvitation({ invitationId: invitation.id }, "en"),
    ).resolves.toMatchObject({ structured: {}, visit: null });

    mocks.findInvitationById.mockResolvedValueOnce(null);
    await expect(
      loadGuestInvitation({ invitationId: "missing" }, "en"),
    ).resolves.toBeNull();
  });
});
