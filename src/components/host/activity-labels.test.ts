import { describe, expect, test } from "vitest";

import {
  activityKindLabelKey,
  activityPolicyLabelKey,
  activityToolLabelKey,
} from "./activity-labels";

describe("activityKindLabelKey", () => {
  test("maps every known audit and notification kind, matching the page.tsx logic it replaces", () => {
    expect(activityKindLabelKey("tool_call")).toBe("toolCall");
    expect(activityKindLabelKey("policy_verdict")).toBe("policyVerdict");
    expect(activityKindLabelKey("decision_applied")).toBe("decisionApplied");
    expect(activityKindLabelKey("reconfirm_chase")).toBe("reconfirmChase");
    expect(activityKindLabelKey("reconfirm_escalation")).toBe(
      "reconfirmEscalation",
    );
    expect(activityKindLabelKey("memory_written")).toBe("memoryWritten");
    expect(activityKindLabelKey("memory_forgotten")).toBe("memoryForgotten");
  });

  test("returns null for an unrecognized kind", () => {
    expect(activityKindLabelKey("something_else")).toBeNull();
  });
});

describe("activityToolLabelKey", () => {
  test("maps all eleven agent tool names", () => {
    const tools = [
      "capture_invitation",
      "confirm_visit",
      "create_temporary_hold",
      "evaluate_overlap",
      "find_visit_options",
      "notify",
      "reschedule_visit",
      "prepare_room_action",
      "list_guest_rooms",
      "find_room_options",
      "search_memory",
    ];
    for (const tool of tools) {
      expect(activityToolLabelKey(tool)).not.toBeNull();
    }
  });

  test("returns null for an unknown tool name", () => {
    expect(activityToolLabelKey("delete_everything")).toBeNull();
  });
});

describe("activityPolicyLabelKey", () => {
  test("passes through the three known decisions", () => {
    expect(activityPolicyLabelKey("allow")).toBe("allow");
    expect(activityPolicyLabelKey("deny")).toBe("deny");
    expect(activityPolicyLabelKey("interrupt")).toBe("interrupt");
  });

  test("returns null for anything else", () => {
    expect(activityPolicyLabelKey("maybe")).toBeNull();
  });
});
