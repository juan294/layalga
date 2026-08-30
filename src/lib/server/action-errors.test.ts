import { afterEach, describe, expect, it, vi } from "vitest";

import { reportActionError, reportedActionError } from "./action-errors";

describe("server action errors", () => {
  afterEach(() => vi.restoreAllMocks());

  it("logs a stable code and correlation id without the error message", () => {
    const error = new Error("secret guest token");
    const logger = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    expect(reportActionError("guest_submit_failed", error, "request-123")).toBe(
      "request-123",
    );
    expect(logger).toHaveBeenCalledWith("[ACTION_FAILED]", {
      code: "guest_submit_failed",
      requestId: "request-123",
      errorName: "Error",
    });
    expect(JSON.stringify(logger.mock.calls)).not.toContain(error.message);
  });

  it("replaces a boundary error with a safe code and correlation id", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const safe = reportedActionError(
      "host_decision_failed",
      new Error("private input"),
    );

    expect(safe.message).toMatch(
      /^host_decision_failed:[0-9a-f]{8}-[0-9a-f-]{27}$/,
    );
    expect(safe.message).not.toContain("private input");
  });
});
