import { randomUUID } from "node:crypto";

export type ActionErrorCode =
  | "guest_change_failed"
  | "guest_options_failed"
  | "guest_reconfirm_failed"
  | "guest_submit_failed"
  | "host_capture_failed"
  | "host_decision_failed";

export function reportActionError(
  code: ActionErrorCode,
  error: unknown,
  requestId: string = randomUUID(),
): string {
  console.error("[ACTION_FAILED]", {
    code,
    requestId,
    errorName: error instanceof Error ? error.name : "UnknownError",
  });
  return requestId;
}

export function reportedActionError(
  code: ActionErrorCode,
  error: unknown,
): Error {
  return new Error(`${code}:${reportActionError(code, error)}`);
}
