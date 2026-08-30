"use client";

import { useActionState, useState } from "react";

import { captureInvitationAction } from "@/app/[locale]/(host)/actions";
import { copyText } from "@/components/frontend-utils";

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
  locale: string;
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
  };
}

export function CaptureInvitationForm({
  locale,
  labels,
}: CaptureInvitationFormProps) {
  const initialCaptureState = { status: "idle" } as const;
  const [state, action, pending] = useActionState(
    captureInvitationAction,
    initialCaptureState,
  );

  return (
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
        disabled={pending}
        style={{ ...buttonStyle, opacity: pending ? 0.55 : 1 }}
        type="submit"
      >
        {pending ? labels.pending : labels.submit}
      </button>

      {state.status === "error" ? (
        <p
          role="alert"
          style={{ color: ink, margin: "0.85rem 0 0", fontWeight: 700 }}
        >
          {state.error === "empty" ? labels.emptyError : labels.failedError}
        </p>
      ) : null}

      {state.status === "success" ? (
        <div
          style={{
            borderTop: `1px solid ${rule}`,
            marginTop: "1.2rem",
            paddingTop: "1rem",
          }}
        >
          <CaptureSuccessAnnouncement label={labels.result} />
          <p style={{ ...labelStyle, color: teal }}>{labels.result}</p>
          <p style={{ color: graphite, lineHeight: 1.55, margin: "0.5rem 0" }}>
            {state.summary}
          </p>
          {state.structured ? (
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
          ) : null}
          {state.guestLink ? (
            <GuestLinkCopy
              copiedLabel={labels.copied}
              failedLabel={labels.copyFailed}
              copyLabel={labels.copy}
              label={labels.guestLink}
              value={state.guestLink}
            />
          ) : null}
        </div>
      ) : null}
    </form>
  );
}

export function CaptureSuccessAnnouncement({
  label,
}: {
  label: string;
}) {
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
    <PoliteStatus
      message={state === "copied" ? copiedLabel : failedLabel}
    />
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
