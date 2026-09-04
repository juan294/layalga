import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations:
    (namespace?: string) => (key: string, values?: Record<string, unknown>) => {
      const full = namespace ? `${namespace}.${key}` : key;
      return values ? `${full}(${JSON.stringify(values)})` : full;
    },
}));

import { activityToolLabelKey } from "@/components/host/activity-labels";
import type { RunTimelineEvent } from "@/app/api/runs/run-data";

import { RunTimeline } from "./run-timeline";

const ALL_TOOL_NAMES = [
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
];

function eventAt(index: number): string {
  return `2026-09-01T09:${String(index).padStart(2, "0")}:00.000Z`;
}

describe("RunTimeline", () => {
  test("labels all ten agent tool names with a non-fallback translation key", () => {
    const events: RunTimelineEvent[] = ALL_TOOL_NAMES.map((name, index) => ({
      at: eventAt(index),
      kind: "tool_call",
      name,
    }));
    const html = renderToStaticMarkup(
      <RunTimeline events={events} locale="en" timeZone="Europe/Madrid" />,
    );

    expect(html).not.toContain("Host.activityTools.other");
    for (const name of ALL_TOOL_NAMES) {
      const key = activityToolLabelKey(name);
      expect(key).not.toBeNull();
      expect(html).toContain(`Host.activityTools.${key}`);
    }
    expect((html.match(/data-testid="run-timeline-event"/g) ?? []).length).toBe(
      ALL_TOOL_NAMES.length,
    );
  });

  test("labels the three policy verdict decisions", () => {
    const events: RunTimelineEvent[] = [
      { at: eventAt(0), kind: "policy_verdict", decision: "allow" },
      { at: eventAt(1), kind: "policy_verdict", decision: "deny" },
      { at: eventAt(2), kind: "policy_verdict", decision: "interrupt" },
    ];
    const html = renderToStaticMarkup(
      <RunTimeline events={events} locale="en" timeZone="UTC" />,
    );

    expect(html).toContain("Host.activityPolicies.allow");
    expect(html).toContain("Host.activityPolicies.deny");
    expect(html).toContain("Host.activityPolicies.interrupt");
    expect(html).not.toContain("Host.activityPolicies.other");
  });

  test("labels an applied decision without any dynamic payload", () => {
    const events: RunTimelineEvent[] = [
      { at: eventAt(0), kind: "decision_applied" },
    ];
    const html = renderToStaticMarkup(
      <RunTimeline events={events} locale="en" timeZone="UTC" />,
    );

    expect(html).toContain("Runs.timeline.decisionApplied");
  });

  test("shows the empty state and no rows when there are no events", () => {
    const html = renderToStaticMarkup(
      <RunTimeline events={[]} locale="en" timeZone="UTC" />,
    );

    expect(html).toContain("Runs.timeline.empty");
    expect(html).not.toContain('data-testid="run-timeline-event"');
  });

  test("shows the executedOn label when present", () => {
    const html = renderToStaticMarkup(
      <RunTimeline
        events={[]}
        executedOn="agentcore"
        locale="en"
        timeZone="UTC"
      />,
    );

    expect(html).toContain("Runs.timeline.executedOn.agentcore");
  });

  test("shows usage only when present", () => {
    const withoutUsage = renderToStaticMarkup(
      <RunTimeline events={[]} locale="en" timeZone="UTC" />,
    );
    expect(withoutUsage).not.toContain("Runs.timeline.usage");

    const withUsage = renderToStaticMarkup(
      <RunTimeline
        events={[]}
        locale="en"
        timeZone="UTC"
        usage={{ tokens: 512, tools: 3 }}
      />,
    );
    expect(withUsage).toContain("Runs.timeline.usage");
  });
});
