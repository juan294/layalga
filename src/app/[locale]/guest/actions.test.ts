import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentGuestInvitation: vi.fn(),
  loadGuestInvitation: vi.fn(),
  findGuestOptionsForAuthority: vi.fn(),
  submitGuestVisitForAuthority: vi.fn(),
  requestGuestChangeCore: vi.fn(),
  reconfirmGuestCore: vi.fn(),
  redirect: vi.fn(() => {
    throw { digest: "NEXT_REDIRECT;test" };
  }),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth/current-guest", () => ({
  getCurrentGuestInvitation: mocks.getCurrentGuestInvitation,
}));
vi.mock("@/core/booking/guest-invitation", () => ({
  loadGuestInvitation: mocks.loadGuestInvitation,
}));
vi.mock("@/core/booking/guest-actions", () => ({
  findGuestOptionsForAuthority: mocks.findGuestOptionsForAuthority,
  submitGuestVisitForAuthority: mocks.submitGuestVisitForAuthority,
  requestGuestChangeCore: mocks.requestGuestChangeCore,
  reconfirmGuestCore: mocks.reconfirmGuestCore,
}));

import {
  findGuestOptionsSession,
  reconfirmGuestSession,
  requestGuestChangeSession,
  submitGuestVisitSession,
} from "./actions";

const invitationId = "00000000-0000-4000-8000-000000000601";
const homeId = "00000000-0000-4000-8000-000000000602";
const partyId = "00000000-0000-4000-8000-000000000603";
const roomId = "00000000-0000-4000-8000-000000000604";

describe("guest session actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentGuestInvitation.mockResolvedValue({
      invitationId,
      homeId,
      partyId,
      partyLocale: "en",
    });
    mocks.loadGuestInvitation.mockResolvedValue({
      id: invitationId,
      homeId,
      partyId,
      structured: {},
      visit: { id: "00000000-0000-4000-8000-000000000605" },
    });
  });

  it("finds options with authority derived from the guest session", async () => {
    mocks.findGuestOptionsForAuthority.mockResolvedValue({
      status: "success",
      options: [],
    });

    const result = await findGuestOptionsSession(
      { status: "idle", options: [] },
      optionForm(),
    );

    expect(result).toEqual({ status: "success", options: [] });
    expect(mocks.findGuestOptionsForAuthority).toHaveBeenCalledWith(
      { id: invitationId, homeId, partyId },
      {
        locale: "en",
        from: "2026-09-18",
        to: "2026-09-20",
        nights: 2,
        adults: 2,
        children: 1,
        pets: 0,
      },
    );
  });

  it("submits a visit and redirects without exposing a token", async () => {
    mocks.submitGuestVisitForAuthority.mockResolvedValue({ runId: "run-1" });

    await expect(
      submitGuestVisitSession({ status: "idle" }, submitForm()),
    ).rejects.toMatchObject({ digest: "NEXT_REDIRECT;test" });

    expect(mocks.submitGuestVisitForAuthority).toHaveBeenCalledWith(
      { id: invitationId, homeId, partyId },
      {
        locale: "en",
        stay: "2026-09-18|2026-09-20",
        adults: 2,
        children: 1,
        pets: 0,
        roomIds: [roomId],
        overflowConsent: true,
      },
    );
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/en/runs/run-1/status?returnTo=%2Fen%2Fguest",
    );
  });

  it("requests a change and redirects without exposing a token", async () => {
    mocks.requestGuestChangeCore.mockResolvedValue({ runId: "run-change" });
    const form = new FormData();
    form.set("locale", "es");
    form.set("message", "Llegaremos un día después");

    await expect(requestGuestChangeSession(form)).rejects.toMatchObject({
      digest: "NEXT_REDIRECT;test",
    });

    expect(mocks.loadGuestInvitation).toHaveBeenCalledWith(
      { invitationId },
      "es",
    );
    expect(mocks.requestGuestChangeCore).toHaveBeenCalledWith(
      expect.objectContaining({ id: invitationId }),
      "Llegaremos un día después",
      "es",
    );
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/es/runs/run-change/status?returnTo=%2Fes%2Fguest",
    );
  });

  it("reconfirms and returns to the session route", async () => {
    mocks.reconfirmGuestCore.mockResolvedValue(true);
    const form = new FormData();
    form.set("locale", "en");

    await expect(reconfirmGuestSession(form)).rejects.toMatchObject({
      digest: "NEXT_REDIRECT;test",
    });

    expect(mocks.loadGuestInvitation).toHaveBeenCalledWith(
      { invitationId },
      "en",
    );
    expect(mocks.redirect).toHaveBeenCalledWith("/en/guest");
  });

  it("returns early from every action without a guest session", async () => {
    mocks.getCurrentGuestInvitation.mockResolvedValue(null);

    await expect(
      findGuestOptionsSession({ status: "idle", options: [] }, optionForm()),
    ).resolves.toEqual({ status: "error", options: [], error: "not_found" });
    await expect(
      submitGuestVisitSession({ status: "idle" }, submitForm()),
    ).resolves.toEqual({ status: "error", error: "not_found" });
    await expect(
      requestGuestChangeSession(new FormData()),
    ).resolves.toBeUndefined();
    await expect(
      reconfirmGuestSession(new FormData()),
    ).resolves.toBeUndefined();

    expect(mocks.findGuestOptionsForAuthority).not.toHaveBeenCalled();
    expect(mocks.submitGuestVisitForAuthority).not.toHaveBeenCalled();
    expect(mocks.loadGuestInvitation).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});

function optionForm(): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    locale: "en",
    from: "2026-09-18",
    to: "2026-09-20",
    nights: "2",
    adults: "2",
    children: "1",
    pets: "0",
  })) {
    form.set(key, value);
  }
  return form;
}

function submitForm(): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    locale: "en",
    stay: "2026-09-18|2026-09-20",
    adults: "2",
    children: "1",
    pets: "0",
    overflowConsent: "on",
  })) {
    form.set(key, value);
  }
  form.append("roomIds", roomId);
  return form;
}
