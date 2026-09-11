"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { z } from "zod";

import type { RunSnapshot } from "@/app/api/runs/run-data";
import { scriptedOutcomeKey } from "@/agent/scripted-outcomes";
import {
  formatHouseholdDateTime,
  pollDelay,
  steadyPollDelay,
} from "@/components/frontend-utils";
import { RunTimeline } from "@/components/runs/run-timeline";

import styles from "./run-status.module.css";

const TERMINAL = new Set(["completed", "interrupted", "failed"]);
const POLL_INTERVAL_MS = 1_500;
const FALLBACK_POLL_DEADLINE_MS = 6 * 60_000;
const runTimelineEventSchema = z.object({
  at: z.iso.datetime(),
  kind: z.enum(["tool_call", "policy_verdict", "decision_applied"]),
  name: z.string().optional(),
  decision: z.enum(["allow", "deny", "interrupt"]).optional(),
});
const runSnapshotSchema = z.object({
  id: z.uuid(),
  status: z.enum(["queued", "running", "completed", "interrupted", "failed"]),
  summary: z.string().nullable(),
  finishedAt: z.iso.datetime().nullable(),
  executedOn: z.enum(["local", "agentcore"]).optional(),
  usage: z.object({ tokens: z.number(), tools: z.number() }).optional(),
  events: z.array(runTimelineEventSchema).default([]),
});

interface RunStatusPollerProps {
  initial: RunSnapshot;
  locale: "en" | "es";
  returnTo: string;
  token?: string;
  timeZone: string;
  /**
   * How long, in milliseconds, the run is allowed to take -- NOT an
   * absolute timestamp. A demo home's `deadline_at` is computed from its
   * simulated clock (routinely days behind the real wall clock), so an
   * absolute server deadline compared against the client's own Date.now()
   * reads as already-past and stops polling before the first request. The
   * duration is clock-agnostic: the caller derives it from
   * `deadline_at - started_at`, both read from the same (possibly
   * simulated) clock, and this component applies it relative to its own
   * real polling start time.
   */
  deadlineMs: number | null;
  onSnapshot?: (snapshot: RunSnapshot) => void;
  showReturnLink?: boolean;
}

export function RunStatusPoller({
  initial,
  locale,
  returnTo,
  token,
  timeZone,
  deadlineMs,
  onSnapshot,
  showReturnLink = true,
}: RunStatusPollerProps) {
  const t = useTranslations("Runs");
  const [run, setRun] = useState(initial);
  const [pollFailed, setPollFailed] = useState(false);
  const [pollStopped, setPollStopped] = useState(false);
  const [pollCycle, setPollCycle] = useState(0);

  useEffect(() => {
    onSnapshot?.(run);
  }, [onSnapshot, run]);

  useEffect(() => {
    if (TERMINAL.has(run.status)) return;
    let active = true;
    let polling = false;
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    let successes = 0;
    const startedAt = Date.now();
    const stopAt = pollStopAt(startedAt, deadlineMs);
    const controller = new AbortController();

    function schedule(delay: number, allowPastDeadline = false) {
      if (!active) return;
      if (!allowPastDeadline && Date.now() >= stopAt) {
        timer = setTimeout(() => {
          if (active) setPollStopped(true);
        }, 0);
        return;
      }
      if (typeof document !== "undefined" && document.hidden) return;
      timer = setTimeout(poll, delay);
    }

    async function poll() {
      if (polling) return;
      polling = true;
      try {
        const query = token ? `?token=${encodeURIComponent(token)}` : "";
        const response = await fetch(`/api/runs/${run.id}${query}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("run_poll_failed");
        const next = runSnapshotSchema.parse(await response.json());
        if (!active) return;
        setRun(next);
        setPollFailed(false);
        failures = 0;
        if (!TERMINAL.has(next.status)) {
          successes += 1;
          schedule(steadyPollDelay(successes));
        }
      } catch {
        if (!active) return;
        setPollFailed(true);
        failures += 1;
        schedule(pollDelay(failures));
      } finally {
        polling = false;
      }
    }

    function resumeWhenVisible() {
      if (!document.hidden) schedule(0);
      else clearTimeout(timer);
    }

    document.addEventListener("visibilitychange", resumeWhenVisible);
    schedule(pollCycle ? 0 : POLL_INTERVAL_MS, pollCycle > 0);
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
      document.removeEventListener("visibilitychange", resumeWhenVisible);
    };
  }, [deadlineMs, pollCycle, run.id, run.status, token]);

  return (
    <section
      className={styles.card}
      data-status={run.status}
      data-testid="run-status"
    >
      <div aria-atomic="true" aria-live="polite" role="status">
        <div className={styles.statusLine}>
          <span
            className={styles.pulse}
            aria-hidden="true"
            data-testid="run-status-pulse"
          />
          <strong>{t(`status.${run.status}`)}</strong>
        </div>
        <p className={styles.explainer}>
          {t(
            pollStopped
              ? "pollStopped"
              : pollFailed
                ? "pollFailed"
                : run.status === "running"
                  ? "working"
                  : `${run.status}Body`,
          )}
        </p>
      </div>
      <RunTimeline
        events={run.events}
        executedOn={run.executedOn}
        locale={locale}
        timeZone={timeZone}
        usage={run.usage}
      />
      {run.summary ? (
        <div className={styles.summary}>
          <span>{t("summaryLabel")}</span>
          <p>{localizedSummary(run.summary, t)}</p>
        </div>
      ) : null}
      {run.finishedAt ? (
        <time className={styles.finished} dateTime={run.finishedAt}>
          {t("finishedAt", {
            time: formatHouseholdDateTime(run.finishedAt, locale, timeZone),
          })}
        </time>
      ) : null}
      {pollStopped ? (
        <button
          className={styles.retryButton}
          onClick={() => {
            setPollStopped(false);
            setPollFailed(false);
            setPollCycle((cycle) => cycle + 1);
          }}
          type="button"
        >
          {t("retryStatus")}
        </button>
      ) : null}
      {showReturnLink && TERMINAL.has(run.status) ? (
        <a
          className={styles.returnLink}
          data-testid="run-return"
          href={returnTo}
        >
          {t("returnToVisit")}
        </a>
      ) : null}
    </section>
  );
}

/**
 * Real-time deadline the poll loop should stop at, applying the server's
 * deadline duration (clock-agnostic) relative to the client's own polling
 * start time -- never the server's absolute timestamp, which for a demo
 * home is computed from a simulated clock that can read as already past
 * relative to the client's real Date.now(). See `deadlineMs` on
 * `RunStatusPollerProps`.
 */
export function pollStopAt(
  clientStartedAtMs: number,
  deadlineMs: number | null,
): number {
  return Number.isFinite(deadlineMs)
    ? clientStartedAtMs + (deadlineMs as number)
    : clientStartedAtMs + FALLBACK_POLL_DEADLINE_MS;
}

export function localizedSummary(
  summary: string,
  t: ReturnType<typeof useTranslations>,
): string {
  const key = scriptedOutcomeKey(summary);
  return key ? t(`outcomes.${key}`) : stripMarkdownEmphasis(summary);
}

/** Strips `**` markdown emphasis markers a live model may include verbatim. */
function stripMarkdownEmphasis(text: string): string {
  return text.replace(/\*\*/g, "");
}
