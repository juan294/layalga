import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ host: vi.fn(), decide: vi.fn() }));
vi.mock("@/lib/auth/current-host", () => ({ getCurrentHost: api.host }));
vi.mock("@/core/booking/decide-stay-request", () => ({
  decideRequestedStay: api.decide,
}));
import { decideStay } from "./stay-decision-actions";

const id = "6df82af8-64be-4127-894a-d57339927c83";
const host = { id: "our-host", homeId: "our-home", displayName: "Bea" };
const data = (answer: string) => {
  const form = new FormData();
  form.set("answer", answer);
  return form;
};
beforeEach(() => {
  vi.resetAllMocks();
  api.host.mockResolvedValue(host);
});
describe("host stay decision", () => {
  it("uses the authenticated household and gives only the recorded outcome and actor to the UI", async () => {
    const form = data("confirm");
    form.set("homeId", "other-home");
    form.set("hostId", "other-host");
    api.decide.mockResolvedValue({
      status: "conflict",
      currentStatus: "declined",
      decidedByName: "Bea",
      decidedByHostId: "private-id",
      visitId: null,
    });
    expect(await decideStay(id, 1, form)).toEqual({
      status: "conflict",
      currentStatus: "declined",
      actor: "Bea",
    });
    expect(api.decide).toHaveBeenCalledWith(
      { id: host.id, homeId: host.homeId },
      id,
      1,
      "confirm",
    );
  });
  it("rejects signed-out sessions and malformed or ambiguous decisions", async () => {
    api.host.mockResolvedValueOnce(null);
    expect(await decideStay(id, 1, data("decline"))).toEqual({
      status: "sign_in",
    });
    const double = data("confirm");
    double.append("answer", "decline");
    for (const [key, version, form] of [
      ["bad", 1, data("decline")],
      [id, 0, data("decline")],
      [id, 1, data("buy")],
      [id, 1, double],
    ] as const)
      expect(await decideStay(key, version, form)).toEqual({
        status: "invalid",
      });
    expect(api.decide).not.toHaveBeenCalled();
  });
  it("allows the host to retry the reviewed answer after a transient failure", async () => {
    api.decide
      .mockRejectedValueOnce(new Error("db unavailable"))
      .mockResolvedValueOnce({
        status: "confirmed",
        currentStatus: "confirmed",
        decidedByName: "Bea",
        replayed: true,
      });
    expect(await decideStay(id, 1, data("confirm"))).toEqual({
      status: "unavailable",
    });
    expect(await decideStay(id, 1, data("confirm"))).toEqual({
      status: "confirmed",
      currentStatus: "confirmed",
      actor: "Bea",
    });
  });
});
