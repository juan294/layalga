"use client";

import type { ReactNode } from "react";
import { useActionState, useCallback, useState } from "react";

import {
  captureInvitationAction,
  revealCapturedInvitationAction,
  type CaptureResultState,
  type CaptureState,
} from "@/app/[locale]/(host)/actions";
import { copyText } from "@/components/frontend-utils";
import { RunStatusPoller } from "@/components/runs/run-status-poller";
import type { RunSnapshot } from "@/app/api/runs/run-data";

import {
  buttonStyle,
  fieldStyle,
  graphite,
  ink,
  labelStyle,
  rule,
  teal,
  visuallyHiddenStyle,
} from "./host-styles";

interface CaptureInvitationFormProps {
  locale: "en" | "es";
  timeZone: string;
  labels: {
    message: string;
    placeholder: string;
    submit: string;
    pending: string;
    result: string;
    structured: string;
    guestLink: string;
    copy: string;
    copied: string;
    copyFailed: string;
    emptyError: string;
    failedError: string;
    queued: string;
    statusLink: string;
    reveal: string;
    revealing: string;
    completionFailed: string;
  };
}

type CaptureLabels = CaptureInvitationFormProps["labels"];

export function CaptureInvitationForm({
  locale,
  labels,
  timeZone,
}: CaptureInvitationFormProps) {
  const initialCaptureState: CaptureState = { status: "idle" };
  const [state, action, pending] = useActionState(
    captureInvitationAction,
    initialCaptureState,
  );
  const [terminalRunId, setTerminalRunId] = useState<string | null>(null);
  const queuedRunId = state.status === "queued" ? state.runId : null;
  const disabled = captureSubmitDisabled(pending, queuedRunId, terminalRunId);
  const markTerminal = useCallback((runId: string) => {
    setTerminalRunId(runId);
  }, []);

  return (
    <CaptureFormBoundary
      captureForm={
        <form action={action} data-testid="host-capture-form">
          <input name="locale" type="hidden" value={locale} />
          <label htmlFor="capture-message" style={labelStyle}>
            {labels.message}
          </label>
          <textarea
            data-testid="host-capture-message"
            id="capture-message"
            name="rawMessage"
            placeholder={labels.placeholder}
            required
            rows={7}
            style={{
              ...fieldStyle,
              margin: "0.55rem 0 0.8rem",
              resize: "vertical",
            }}
          />
          <button
            data-testid="host-capture-submit"
            disabled={disabled}
            style={{ ...buttonStyle, opacity: disabled ? 0.55 : 1 }}
            type="submit"
          >
            {pending
              ? labels.pending
              : queuedRunId && terminalRunId !== queuedRunId
                ? labels.queued
                : labels.submit}
          </button>
          {state.status === "error" ? (
            <p
              role="alert"
              style={{ color: ink, margin: "0.85rem 0 0", fontWeight: 700 }}
            >
              {state.error === "empty" ? labels.emptyError : labels.failedError}
            </p>
          ) : null}
        </form>
      }
      resultPanel={
        queuedRunId ? (
          <CaptureQueuedPanel
            key={queuedRunId}
            labels={labels}
            locale={locale}
            onTerminal={markTerminal}
            runId={queuedRunId}
            timeZone={timeZone}
          />
        ) : null
      }
    />
  );
}

export function captureSubmitDisabled(
  pending: boolean,
  queuedRunId: string | null,
  terminalRunId: string | null,
): boolean {
  return pending || (queuedRunId !== null && terminalRunId !== queuedRunId);
}

export function captureStatusHref(locale: "en" | "es", runId: string): string {
  return `/${locale}/runs/${runId}/status?returnTo=${encodeURIComponent(`/${locale}`)}`;
}

export function CaptureFormBoundary({
  captureForm,
  resultPanel,
}: {
  captureForm: ReactNode;
  resultPanel: ReactNode;
}) {
  return (
    <>
      {captureForm}
      {resultPanel}
    </>
  );
}

function CaptureQueuedPanel({
  labels,
  locale,
  onTerminal,
  runId,
  timeZone,
}: {
  labels: CaptureLabels;
  locale: "en" | "es";
  onTerminal: (runId: string) => void;
  runId: string;
  timeZone: string;
}) {
  const initial: RunSnapshot = {
    id: runId,
    status: "queued",
    summary: null,
    finishedAt: null,
    events: [],
  };
  const [snapshot, setSnapshot] = useState<RunSnapshot>(initial);
  const handleSnapshot = useCallback(
    (next: RunSnapshot) => {
      setSnapshot(next);
      if (next.status !== "queued" && next.status !== "running") {
        onTerminal(next.id);
      }
    },
    [onTerminal],
  );

  return (
    <section
      data-testid="capture-queued"
      style={{
        borderTop: `1px solid ${rule}`,
        marginTop: "1.2rem",
        paddingTop: "1rem",
      }}
    >
      <CaptureSuccessAnnouncement label={labels.queued} />
      <a
        data-testid="capture-status-link"
        href={captureStatusHref(locale, runId)}
      >
        {labels.statusLink}
      </a>
      <RunStatusPoller
        deadlineAt={null}
        initial={initial}
        locale={locale}
        onSnapshot={handleSnapshot}
        returnTo={`/${locale}`}
        showReturnLink={false}
        timeZone={timeZone}
      />
      {snapshot.status === "completed" ? (
        <CaptureCompletionForm labels={labels} locale={locale} runId={runId} />
      ) : null}
    </section>
  );
}

function CaptureCompletionForm({
  labels,
  locale,
  runId,
}: {
  labels: CaptureLabels;
  locale: "en" | "es";
  runId: string;
}) {
  const initial: CaptureResultState = { status: "idle" };
  const [state, action, pending] = useActionState(
    revealCapturedInvitationAction,
    initial,
  );

  return (
    <form action={action} data-testid="capture-completion-form">
      <input name="locale" type="hidden" value={locale} />
      <input name="runId" type="hidden" value={runId} />
      {state.status === "success" ? (
        <CaptureResult labels={labels} state={state} />
      ) : (
        <>
          {state.status === "error" ? (
            <p role="alert" style={{ color: ink, fontWeight: 700 }}>
              {labels.completionFailed}
            </p>
          ) : null}
          <button
            data-testid="capture-reveal"
            disabled={pending}
            style={{ ...buttonStyle, opacity: pending ? 0.55 : 1 }}
            type="submit"
          >
            {pending ? labels.revealing : labels.reveal}
          </button>
        </>
      )}
    </form>
  );
}

function CaptureResult({
  labels,
  state,
}: {
  labels: CaptureLabels;
  state: Extract<CaptureResultState, { status: "success" }>;
}) {
  return (
    <div style={{ marginTop: "1rem" }}>
      <CaptureSuccessAnnouncement label={labels.result} />
      <p style={{ ...labelStyle, color: teal }}>{labels.result}</p>
      <details
        data-testid="structured-invitation"
        style={{ marginTop: "0.8rem" }}
      >
        <summary style={{ cursor: "pointer", fontWeight: 750 }}>
          {labels.structured}
        </summary>
        <pre
          style={{
            borderLeft: `3px solid ${teal}`,
            fontSize: "0.75rem",
            overflowX: "auto",
            padding: "0.65rem",
            whiteSpace: "pre-wrap",
          }}
        >
          {JSON.stringify(state.structured, null, 2)}
        </pre>
      </details>
      <GuestLinkCopy
        copiedLabel={labels.copied}
        failedLabel={labels.copyFailed}
        copyLabel={labels.copy}
        label={labels.guestLink}
        value={state.guestLink}
      />
    </div>
  );
}

export function CaptureSuccessAnnouncement({ label }: { label: string }) {
  return <PoliteStatus hidden message={label} />;
}

function GuestLinkCopy({
  label,
  value,
  copyLabel,
  copiedLabel,
  failedLabel,
}: {
  label: string;
  value: string;
  copyLabel: string;
  copiedLabel: string;
  failedLabel: string;
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );

  async function copy() {
    const copied = navigator.clipboard
      ? await copyText((text) => navigator.clipboard.writeText(text), value)
      : false;
    setCopyState(copied ? "copied" : "failed");
  }

  return (
    <div style={{ marginTop: "0.9rem" }}>
      <p style={labelStyle}>{label}</p>
      <div
        style={{
          alignItems: "stretch",
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) auto",
          marginTop: "0.35rem",
        }}
      >
        <a
          data-testid="guest-link"
          href={value}
          style={{
            border: `1px solid ${rule}`,
            color: teal,
            overflow: "hidden",
            padding: "0.62rem",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {value}
        </a>
        <button
          data-testid="copy-guest-link"
          onClick={copy}
          style={buttonStyle}
          type="button"
        >
          {copyButtonLabel(copyState, copyLabel, copiedLabel)}
        </button>
      </div>
      <CopyFeedback
        copiedLabel={copiedLabel}
        failedLabel={failedLabel}
        state={copyState}
      />
    </div>
  );
}

export function copyButtonLabel(
  state: "idle" | "copied" | "failed",
  copyLabel: string,
  copiedLabel: string,
): string {
  return state === "copied" ? copiedLabel : copyLabel;
}

export function CopyFeedback({
  state,
  copiedLabel,
  failedLabel,
}: {
  state: "idle" | "copied" | "failed";
  copiedLabel: string;
  failedLabel: string;
}) {
  if (state === "idle") return null;

  return (
    <PoliteStatus message={state === "copied" ? copiedLabel : failedLabel} />
  );
}

function PoliteStatus({
  message,
  hidden = false,
}: {
  message: string;
  hidden?: boolean;
}) {
  return (
    <p
      aria-atomic="true"
      aria-live="polite"
      role="status"
      style={hidden ? visuallyHiddenStyle : { color: graphite }}
    >
      {message}
    </p>
  );
}
