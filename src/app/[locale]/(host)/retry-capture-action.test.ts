import { beforeEach, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({
  host: vi.fn(),
  retry: vi.fn(),
  after: vi.fn(),
  execute: vi.fn(),
  db: {},
  report: vi.fn(),
}));
vi.mock("@/lib/auth/current-host", () => ({ requireHost: deps.host }));
vi.mock("@/agent/run-task", () => ({ retryHostCaptureRun: deps.retry }));
vi.mock("@/agent/client", () => ({
  getAgentClient: () => ({ executeQueued: deps.execute }),
}));
vi.mock("next/server", () => ({ after: deps.after }));
vi.mock("@/core/db/client", () => ({
  getDatabaseConnection: () => ({ db: deps.db }),
}));
vi.mock("@/lib/server/action-errors", () => ({
  reportActionError: deps.report,
}));
import { retryCapturedInvitationAction } from "./actions";

const host = {
  id: "321288ef-78ee-4ca7-b999-399620348bf8",
  homeId: "3d815b8f-18fd-4d1c-b58a-17dd27cfdaee",
};
const runId = "1961f1a2-8ae3-4b92-9224-f67875c68110";
function form() {
  const data = new FormData();
  data.set("runId", runId);
  data.set("locale", "es");
  data.set("rawMessage", "Edited client draft");
  data.set("hostId", "other");
  return data;
}
beforeEach(() => {
  vi.resetAllMocks();
  deps.host.mockResolvedValue(host);
});
it("dispatches the original run with the stored task only after the retry is accepted", async () => {
  const stored = {
    task: "host_capture",
    homeId: host.homeId,
    hostId: host.id,
    rawMessage: "Original",
    locale: "en",
  };
  deps.retry.mockResolvedValue(stored);
  expect(await retryCapturedInvitationAction(form())).toBe("queued");
  expect(deps.host).toHaveBeenCalledWith("es");
  expect(deps.retry).toHaveBeenCalledWith(deps.db, host, runId);
  expect(deps.execute).not.toHaveBeenCalled();
  await deps.after.mock.calls[0]![0]();
  expect(deps.execute).toHaveBeenCalledWith(runId, stored);
});
it("leaves an unavailable or malformed run alone", async () => {
  deps.retry.mockResolvedValue(null);
  expect(await retryCapturedInvitationAction(form())).toBe("unavailable");
  const invalid = form();
  invalid.set("runId", "bad");
  expect(await retryCapturedInvitationAction(invalid)).toBe("unavailable");
  expect(deps.retry).toHaveBeenCalledTimes(1);
  expect(deps.after).not.toHaveBeenCalled();
});
it("keeps retry inaccessible when the session ends", async () => {
  deps.host.mockRejectedValue(new Error("sign-in required"));
  await expect(retryCapturedInvitationAction(form())).rejects.toThrow(
    "sign-in required",
  );
  expect(deps.retry).not.toHaveBeenCalled();
});
