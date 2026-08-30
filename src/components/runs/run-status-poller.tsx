"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import type { RunSnapshot } from "@/app/api/runs/run-data";
import {
  formatHouseholdDateTime,
  pollDelay,
} from "@/components/frontend-utils";

import styles from "./run-status.module.css";

const TERMINAL = new Set(["completed", "interrupted", "failed"]);
const POLL_INTERVAL_MS = 1_500;
const FALLBACK_POLL_DEADLINE_MS = 6 * 60_000;

interface RunStatusPollerProps {
  initial: RunSnapshot;
  locale: "en" | "es";
  returnTo: string;
  token?: string;
  timeZone: string;
  deadlineAt: string | null;
}

export function RunStatusPoller({
  initial,
  locale,
  returnTo,
  token,
  timeZone,
  deadlineAt,
}: RunStatusPollerProps) {
  const t = useTranslations("Runs");
  const [run, setRun] = useState(initial);
  const [pollFailed, setPollFailed] = useState(false);
  const [pollStopped, setPollStopped] = useState(false);
  const [pollCycle, setPollCycle] = useState(0);

  useEffect(() => {
    if (TERMINAL.has(run.status)) return;
    let active = true;
    let polling = false;
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    const startedAt = Date.now();
    const parsedDeadline = deadlineAt ? new Date(deadlineAt).getTime() : NaN;
    const stopAt = Number.isFinite(parsedDeadline)
      ? parsedDeadline
      : startedAt + FALLBACK_POLL_DEADLINE_MS;
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
        const next = (await response.json()) as RunSnapshot;
        if (!active) return;
        setRun(next);
        setPollFailed(false);
        failures = 0;
        if (!TERMINAL.has(next.status)) {
          schedule(POLL_INTERVAL_MS);
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
  }, [deadlineAt, pollCycle, run.id, run.status, token]);

  return (
    <section
      className={styles.card}
      data-status={run.status}
      data-testid="run-status"
    >
      <div aria-atomic="true" aria-live="polite" role="status">
        <div className={styles.statusLine}>
          <span className={styles.pulse} aria-hidden="true" />
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
      {run.summary ? (
        <div className={styles.summary}>
          <span>{t("summaryLabel")}</span>
          <p>{run.summary}</p>
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
      {TERMINAL.has(run.status) ? (
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
