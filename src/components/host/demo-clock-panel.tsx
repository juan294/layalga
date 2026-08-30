"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  clockInputToIso,
  clockInputValue,
  formatHouseholdDateTime,
} from "@/components/frontend-utils";

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
  };
}

export function DemoClockPanel({
  current,
  currentLabel,
  homeId,
  locale,
  timeZone,
  labels,
}: DemoClockPanelProps) {
  const [now, setNow] = useState(current);
  const [nowLabel, setNowLabel] = useState(currentLabel);
  const router = useRouter();
  const [custom, setCustom] = useState(clockInputValue(current, timeZone));
  const [working, setWorking] = useState<
    "chase" | "escalation" | "custom" | null
  >(null);
  const [failed, setFailed] = useState(false);

  async function warp(
    value: string,
    action: "chase" | "escalation" | "custom",
  ) {
    setWorking(action);
    setFailed(false);
    try {
      const response = await fetch("/api/demo/clock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ homeId, now: value }),
      });
      if (!response.ok) throw new Error("clock");
      const result = (await response.json()) as { now?: string };
      if (!result.now || Number.isNaN(new Date(result.now).getTime())) {
        throw new Error("clock_response");
      }
      setNow(result.now);
      setNowLabel(formatHouseholdDateTime(result.now, locale, timeZone));
      setCustom(clockInputValue(result.now, timeZone));
      router.refresh();
    } catch {
      setFailed(true);
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
        dateTime={now}
        style={{
          color: graphite,
          display: "block",
          fontFamily: "var(--font-jetbrains-mono, ui-monospace, monospace)",
          fontSize: "0.82rem",
          margin: "0.45rem 0 0.8rem",
        }}
      >
        {nowLabel}
      </time>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem" }}>
        <button
          aria-busy={working === "chase"}
          disabled={working !== null}
          onClick={() => warp("2026-09-15T07:00:00.000Z", "chase")}
          style={{ ...quietButtonStyle, opacity: working ? 0.55 : 1 }}
          type="button"
        >
          {working === "chase" ? labels.working : labels.chase}
        </button>
        <button
          aria-busy={working === "escalation"}
          disabled={working !== null}
          onClick={() => warp("2026-09-16T07:05:00.000Z", "escalation")}
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
          disabled={working !== null}
          onChange={(event) => setCustom(event.target.value)}
          style={fieldStyle}
          type="datetime-local"
          value={custom}
        />
        <button
          aria-busy={working === "custom"}
          disabled={working !== null || !custom}
          onClick={() => warp(clockInputToIso(custom, timeZone), "custom")}
          style={{ ...buttonStyle, opacity: working ? 0.55 : 1 }}
          type="button"
        >
          {working === "custom" ? labels.working : labels.set}
        </button>
      </div>
      {failed ? <p role="alert">{labels.error}</p> : null}
    </div>
  );
}
