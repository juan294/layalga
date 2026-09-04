"use client";

import { useTranslations } from "next-intl";

import type { RunTimelineEvent } from "@/app/api/runs/run-data";
import {
  activityPolicyLabelKey,
  activityToolLabelKey,
} from "@/components/host/activity-labels";
import { formatHouseholdDateTime } from "@/components/frontend-utils";

import styles from "./run-timeline.module.css";

interface RunTimelineProps {
  events: RunTimelineEvent[];
  executedOn?: "local" | "agentcore";
  locale: "en" | "es";
  timeZone: string;
  usage?: { tokens: number; tools: number };
}

export function RunTimeline({
  events,
  executedOn,
  locale,
  timeZone,
  usage,
}: RunTimelineProps) {
  const t = useTranslations("Runs.timeline");
  const tHost = useTranslations("Host");

  return (
    <section className={styles.wrapper} data-testid="run-timeline-panel">
      <p className={styles.title}>{t("title")}</p>
      {executedOn ? (
        <p className={styles.meta}>{t(`executedOn.${executedOn}`)}</p>
      ) : null}
      {usage ? (
        <p className={styles.meta}>
          {t("usage", { tokens: usage.tokens, tools: usage.tools })}
        </p>
      ) : null}
      {events.length === 0 ? (
        <p className={styles.empty}>{t("empty")}</p>
      ) : (
        <ol className={styles.list} data-testid="run-timeline">
          {events.map((event, index) => (
            <li
              className={styles.row}
              data-kind={event.kind}
              data-testid="run-timeline-event"
              key={`${event.kind}-${event.at}-${index}`}
            >
              <time className={styles.time} dateTime={event.at}>
                {formatHouseholdDateTime(event.at, locale, timeZone)}
              </time>
              <span>{eventLabel(event, t, tHost)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function eventLabel(
  event: RunTimelineEvent,
  t: ReturnType<typeof useTranslations>,
  tHost: ReturnType<typeof useTranslations>,
): string {
  if (event.kind === "tool_call") {
    const key = event.name ? activityToolLabelKey(event.name) : null;
    return tHost(`activityTools.${key ?? "other"}`);
  }
  if (event.kind === "policy_verdict") {
    const key = event.decision ? activityPolicyLabelKey(event.decision) : null;
    return tHost(`activityPolicies.${key ?? "other"}`);
  }
  return t("decisionApplied");
}
