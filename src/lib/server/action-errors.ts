import { randomUUID } from "node:crypto";

export type ActionErrorCode =
  | "calendar_feed_issue_failed"
  | "calendar_feed_revoke_failed"
  | "email_settings_update_failed"
  | "guest_change_failed"
  | "guest_options_failed"
  | "guest_reconfirm_failed"
  | "guest_submit_failed"
  | "host_capture_failed"
  | "host_decision_failed"
  | "memory_forget_failed"
  | "private_room_block_cancel_failed"
  | "private_room_block_create_failed"
  | "room_inventory_create_failed"
  | "room_inventory_update_failed"
  | "room_override_create_failed"
  | "room_override_remove_failed"
  | "room_proposal_apply_failed"
  | "room_proposal_dismiss_failed"
  | "room_proposal_request_failed";

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
