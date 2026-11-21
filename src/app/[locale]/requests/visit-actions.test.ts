import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requester: vi.fn(),
  load: vi.fn(),
  change: vi.fn(),
  reconfirm: vi.fn(),
}));
vi.mock("@/lib/auth/verified-requester", () => ({
  verifiedRequester: mocks.requester,
}));
vi.mock("@/core/booking/requested-visit", () => ({
  loadRequestedVisit: mocks.load,
}));
vi.mock("@/core/booking/guest-actions", () => ({
  requestGuestChangeCore: mocks.change,
  reconfirmGuestCore: mocks.reconfirm,
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(to);
  },
}));
import { changeRequestedVisit, reconfirmRequestedVisit } from "./visit-actions";

const id = "b71bb79e-0e55-4f72-a111-c94850d94466";
const form = new FormData();
form.set("locale", "es");
form.set("message", "Podemos llegar un día después?");
const idle = { status: "idle" } as const;
beforeEach(() => {
  vi.resetAllMocks();
  mocks.requester.mockResolvedValue({ userId: "owner" });
  mocks.load.mockResolvedValue({
    visit: { id: "visit", status: "confirmed", preArrival: true },
  });
});

it("refuses to change or reconfirm another account's request", async () => {
  mocks.load.mockResolvedValue(null);
  expect(await changeRequestedVisit(id, idle, form)).toEqual(idle);
  await reconfirmRequestedVisit(id, form);
  expect(mocks.load).toHaveBeenCalledWith("owner", id, "es");
  expect(mocks.change).not.toHaveBeenCalled();
  expect(mocks.reconfirm).not.toHaveBeenCalled();
});
it("routes an authorized change to the normal run and confirmation back to the private receipt", async () => {
  mocks.change.mockResolvedValue({ runId: "job" });
  await expect(changeRequestedVisit(id, idle, form)).rejects.toThrow(
    "/es/runs/job/status",
  );
  await reconfirmRequestedVisit(id, form);
  expect(mocks.reconfirm).not.toHaveBeenCalled();
  mocks.load.mockResolvedValue({
    visit: { id: "visit", status: "reconfirm_pending", preArrival: true },
  });
  mocks.reconfirm.mockResolvedValue(true);
  await expect(reconfirmRequestedVisit(id, form)).rejects.toThrow(
    "/es/requests/" + id,
  );
});
it("keeps cancellation subject to its separate review and rejects invalid or signed-out access", async () => {
  mocks.change.mockResolvedValue({ cancellationRequested: true });
  await expect(changeRequestedVisit(id, idle, form)).rejects.toThrow(
    "cancel=review",
  );
  mocks.requester.mockResolvedValue(null);
  await changeRequestedVisit(id, idle, form);
  await changeRequestedVisit("invalid", idle, form);
  expect(mocks.change).toHaveBeenCalledTimes(1);
});

it("rejects a previously open reconfirmation form after arrival", async () => {
  mocks.load.mockResolvedValue({
    visit: { status: "reconfirm_pending", preArrival: false },
  });
  await reconfirmRequestedVisit(id, form);
  expect(mocks.reconfirm).not.toHaveBeenCalled();
});
