"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { useHydrated } from "@/components/use-hydrated";

import { clockInputToIso, clockInputValue } from "@/components/frontend-utils";

import {
  buttonStyle,
  fieldStyle,
  graphite,
  labelStyle,
  quietButtonStyle,
  rule,
  teal,
} from "./host-styles";

interface DemoClockPanelProps {
  current: string;
  currentLabel: string;
  homeId: string;
  locale: string;
  timeZone: string;
  labels: {
    current: string;
    chase: string;
    escalation: string;
    custom: string;
    set: string;
    working: string;
    error: string;
    noEligible: string;
    alreadyDue: string;
    advanced: string;
    backward: string;
  };
}

export function DemoClockPanel({
  current,
  currentLabel,
  homeId,
  timeZone,
  labels,
}: DemoClockPanelProps) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [customState, setCustom] = useState({
    source: current,
    value: clockInputValue(current, timeZone),
  });
  const custom =
    customState.source === current
      ? customState.value
      : clockInputValue(current, timeZone);
  const [working, setWorking] = useState<
    "chase" | "escalation" | "custom" | null
  >(null);
  const [failed, setFailed] = useState<"error" | "backward" | null>(null);
  const [feedback, setFeedback] = useState<
    "noEligible" | "alreadyDue" | "advanced" | null
  >(null);

  async function warp(action: "chase" | "escalation" | "custom") {
    setWorking(action);
    setFailed(null);
    setFeedback(null);
    try {
      const payload =
        action === "custom"
          ? { homeId, now: clockInputToIso(custom, timeZone) }
          : { homeId, action };
      const response = await fetch("/api/demo/clock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as {
        now?: string;
        outcome?: string;
        error?: string;
      };
      if (!response.ok) {
        setFailed(result.error === "backward_clock" ? "backward" : "error");
        return;
      }
      if (!result.now || Number.isNaN(new Date(result.now).getTime())) {
        throw new Error("clock_response");
      }
      if (
        !["no_eligible", "already_due", "advanced"].includes(
          result.outcome ?? "",
        )
      )
        throw new Error("clock_response");
      setFeedback(
        result.outcome === "no_eligible"
          ? "noEligible"
          : result.outcome === "already_due"
            ? "alreadyDue"
            : "advanced",
      );
      setCustom({
        source: result.now,
        value: clockInputValue(result.now, timeZone),
      });
      // A no-work response has no visit mutation to refresh. Avoid racing the
      // guest navigation with a redundant host refresh after repeated presses.
      if (result.outcome !== "no_eligible" || result.now !== current) {
        router.refresh();
      }
    } catch {
      setFailed("error");
    } finally {
      setWorking(null);
    }
  }

  return (
    <div
      style={{
        borderTop: `1px solid ${rule}`,
        marginTop: "1rem",
        paddingTop: "1rem",
      }}
    >
      <p style={{ ...labelStyle, color: teal }}>{labels.current}</p>
      <time
        dateTime={current}
        style={{
          color: graphite,
          display: "block",
          fontFamily: "var(--font-jetbrains-mono, ui-monospace, monospace)",
          fontSize: "0.82rem",
          margin: "0.45rem 0 0.8rem",
        }}
      >
        {currentLabel}
      </time>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem" }}>
        <button
          aria-busy={working === "chase"}
          data-testid="demo-clock-chase"
          disabled={!hydrated || working !== null}
          onClick={() => warp("chase")}
          style={{ ...quietButtonStyle, opacity: working ? 0.55 : 1 }}
          type="button"
        >
          {working === "chase" ? labels.working : labels.chase}
        </button>
        <button
          aria-busy={working === "escalation"}
          data-testid="demo-clock-escalation"
          disabled={!hydrated || working !== null}
          onClick={() => warp("escalation")}
          style={{ ...quietButtonStyle, opacity: working ? 0.55 : 1 }}
          type="button"
        >
          {working === "escalation" ? labels.working : labels.escalation}
        </button>
      </div>
      <label
        htmlFor="demo-clock-custom"
        style={{ ...labelStyle, display: "block", marginTop: "0.9rem" }}
      >
        {labels.custom}
      </label>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          marginTop: "0.4rem",
        }}
      >
        <input
          id="demo-clock-custom"
          disabled={!hydrated || working !== null}
          onChange={(event) =>
            setCustom({ source: current, value: event.target.value })
          }
          style={fieldStyle}
          type="datetime-local"
          value={custom}
        />
        <button
          aria-busy={working === "custom"}
          disabled={!hydrated || working !== null || !custom}
          onClick={() => warp("custom")}
          style={{ ...buttonStyle, opacity: working ? 0.55 : 1 }}
          type="button"
        >
          {working === "custom" ? labels.working : labels.set}
        </button>
      </div>
      {feedback ? (
        <p data-testid="demo-clock-feedback" role="status">
          {labels[feedback]}
        </p>
      ) : null}
      {failed ? <p role="alert">{labels[failed]}</p> : null}
    </div>
  );
}
