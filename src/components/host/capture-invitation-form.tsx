"use client";

import type { ReactNode } from "react";
import {
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  captureInvitationAction,
  retryCapturedInvitationAction,
  revealCapturedInvitationAction,
  type CaptureResultState,
  type CaptureState,
} from "@/app/[locale]/(host)/actions";
import ledgerStyles from "./room-ledger.module.css";
import { copyText } from "@/components/frontend-utils";
import { RunStatusPoller } from "@/components/runs/run-status-poller";
import type { RunSnapshot } from "@/app/api/runs/run-data";
import { invitationRememberedContext } from "@/lib/json-object";

import {
  buttonStyle,
  fieldStyle,
  graphite,
  ink,
  labelStyle,
  quietButtonStyle,
  rule,
  teal,
  visuallyHiddenStyle,
} from "./host-styles";

interface CaptureInvitationFormProps {
  locale: "en" | "es";
  timeZone: string;
  parties: { id: string; label: string }[];
  labels: CaptureLabels;
}

export type CaptureLabels =
  typeof import("../../../messages/en.json").Host.capture & {
    remembered: string;
  };

export function CaptureInvitationForm({
  locale,
  labels,
  timeZone,
  parties,
}: CaptureInvitationFormProps) {
  const [kind, setKind] = useState("new");
  const [partyId, setPartyId] = useState("");
  const [invalidPartyId, setInvalidPartyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const captureId = useRef<string | null>(null);
  const partySelect = useRef<HTMLSelectElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [terminalRunId, setTerminalRunId] = useState<string | null>(null);
  const [state, action, pending] = useActionState(
    async (previous: CaptureState, form: FormData): Promise<CaptureState> => {
      if (!captureId.current || form.get("intent") === "new")
        captureId.current = crypto.randomUUID();
      form.set("captureId", captureId.current);
      try {
        const next = await captureInvitationAction(previous, form);
        setInvalidPartyId(
          next.status === "error" && next.error === "party"
            ? String(form.get("partyId") ?? "")
            : null,
        );
        if (next.status === "queued") {
          setTerminalRunId(null);
          setAttempt((count) => count + 1);
        }
        return next;
      } catch {
        return { status: "error", error: "failed" };
      }
    },
    { status: "idle" } as CaptureState,
  );
  const queuedRunId = state.status === "queued" ? state.runId : null;
  const disabled = captureSubmitDisabled(pending, queuedRunId, terminalRunId);
  const finished = !!queuedRunId && terminalRunId === queuedRunId;
  const needsNew =
    state.status === "error" &&
    (state.error === "changed" || state.error === "scrubbed");
  const newSubmission = needsNew || finished;
  const partyError =
    kind === "returning" &&
    invalidPartyId === partyId &&
    state.status === "error" &&
    state.error === "party";
  const selectedParty =
    kind === "returning" && parties.find((party) => party.id === partyId);

  useEffect(() => {
    if (partyError) partySelect.current?.focus();
  }, [partyError, state]);

  return (
    <CaptureFormBoundary
      captureForm={
        <form
          action={action}
          data-testid="host-capture-form"
          onReset={(event) => event.preventDefault()}
        >
          <input name="locale" type="hidden" value={locale} />
          <label htmlFor="capture-party-kind" style={labelStyle}>
            {labels.partyKind}
          </label>
          <select
            id="capture-party-kind"
            name="partyKind"
            value={kind}
            onChange={(event) => {
              setKind(event.target.value);
              setInvalidPartyId(null);
            }}
            className={ledgerStyles.touchSelect}
          >
            <option value="new">{labels.newParty}</option>
            <option value="returning">{labels.returningParty}</option>
          </select>
          {kind === "returning" && (
            <>
              <label htmlFor="capture-party" style={labelStyle}>
                {labels.selectParty}
              </label>
              <select
                id="capture-party"
                ref={partySelect}
                name="partyId"
                value={partyId}
                aria-invalid={partyError || undefined}
                aria-describedby={
                  partyError
                    ? "capture-error"
                    : selectedParty
                      ? "capture-party-history"
                      : undefined
                }
                onChange={(event) => {
                  setPartyId(event.target.value);
                  setInvalidPartyId(null);
                }}
                aria-required="true"
                className={ledgerStyles.touchSelect}
              >
                <option value="">{labels.selectParty}</option>
                {parties.map((party) => (
                  <option key={party.id} value={party.id}>
                    {party.label}
                  </option>
                ))}
              </select>
              {selectedParty && (
                <p
                  id="capture-party-history"
                  style={{
                    color: graphite,
                    overflowWrap: "anywhere",
                    margin: "0.35rem 0 0.75rem",
                  }}
                >
                  {selectedParty.label}
                </p>
              )}
            </>
          )}
          <label htmlFor="capture-message" style={labelStyle}>
            {labels.message}
          </label>
          <textarea
            data-testid="host-capture-message"
            id="capture-message"
            name="rawMessage"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
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
            name="intent"
            value={newSubmission ? "new" : "retry"}
            data-testid="host-capture-submit"
            disabled={disabled}
            style={{ ...buttonStyle, opacity: disabled ? 0.55 : 1 }}
            type="submit"
          >
            {pending
              ? labels.pending
              : queuedRunId && !finished
                ? labels.queued
                : newSubmission
                  ? labels.newSubmission
                  : labels.submit}
          </button>
          {state.status === "error" && state.error === "failed" && (
            <button
              type="submit"
              name="intent"
              value="new"
              disabled={pending}
              style={buttonStyle}
            >
              {labels.newSubmission}
            </button>
          )}
          {state.status === "error" &&
          (state.error !== "party" || partyError) ? (
            <p
              id="capture-error"
              role="alert"
              style={{ color: ink, margin: "0.85rem 0 0", fontWeight: 700 }}
            >
              {
                labels[
                  (
                    {
                      empty: "emptyError",
                      party: "partyError",
                      changed: "changedError",
                      scrubbed: "scrubbedError",
                      failed: "failedError",
                    } as const
                  )[state.error]
                ]
              }
            </p>
          ) : null}
        </form>
      }
      resultPanel={
        queuedRunId ? (
          <CaptureQueuedPanel
            key={`${queuedRunId}-${attempt}`}
            labels={labels}
            locale={locale}
            onTerminal={setTerminalRunId}
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

export function CaptureQueuedPanel({
  labels,
  locale,
  onTerminal,
  runId,
  timeZone,
  initial,
  retryable = true,
  statusPage = false,
  deadlineMs = null,
}: {
  labels: CaptureLabels;
  locale: "en" | "es";
  onTerminal?: (id: string) => void;
  runId: string;
  timeZone: string;
  initial?: RunSnapshot;
  retryable?: boolean;
  statusPage?: boolean;
  deadlineMs?: number | null;
}) {
  const queued: RunSnapshot = {
    id: runId,
    status: "queued",
    finishedAt: null,
    summary: null,
    events: [],
  };
  const [snapshot, setSnapshot] = useState(initial ?? queued);
  const [attempt, setAttempt] = useState(0);
  const [retryState, retry, pending] = useActionState(
    async (_prev: string, form: FormData) => {
      try {
        const result = await retryCapturedInvitationAction(form);
        if (result === "queued") {
          setSnapshot(queued);
          setAttempt((count) => count + 1);
        }
        return result;
      } catch {
        return "error";
      }
    },
    "idle",
  );
  const handleSnapshot = useCallback(
    (next: RunSnapshot) => {
      if (next.id !== runId) return;
      setSnapshot(next);
      if (next.status !== "queued" && next.status !== "running")
        onTerminal?.(next.id);
    },
    [onTerminal, runId],
  );
  return (
    <section
      data-testid="capture-queued"
      style={{
        borderTop: `1px solid ${rule}`,
        paddingTop: "1rem",
        marginTop: "1rem",
      }}
    >
      {!statusPage && (
        <a
          data-testid="capture-status-link"
          href={captureStatusHref(locale, runId)}
        >
          {labels.statusLink}
        </a>
      )}
      <RunStatusPoller
        key={attempt}
        deadlineMs={deadlineMs}
        initial={attempt ? queued : (initial ?? queued)}
        locale={locale}
        onSnapshot={handleSnapshot}
        returnTo={`/${locale}`}
        showReturnLink={statusPage}
        timeZone={timeZone}
      />
      {snapshot.status === "completed" && (
        <CaptureCompletionForm labels={labels} locale={locale} runId={runId} />
      )}
      {(snapshot.status === "queued" || snapshot.status === "running") && (
        <p role="status">{labels.awaitCompletion}</p>
      )}
      {(snapshot.status === "failed" || snapshot.status === "interrupted") && (
        <div>
          <p>{labels.retryExhausted}</p>
          <p style={{ overflowWrap: "anywhere" }}>
            {labels.reference} <code>{runId}</code>
          </p>
          {snapshot.status === "failed" &&
            retryable &&
            retryState !== "unavailable" && (
              <form action={retry}>
                <input type="hidden" name="runId" value={runId} />
                <input type="hidden" name="locale" value={locale} />
                <button type="submit" style={buttonStyle} disabled={pending}>
                  {pending ? labels.retrying : labels.retrySubmission}
                </button>
              </form>
            )}
          {retryState === "error" && (
            <p role="alert">{labels.runtimeFailure}</p>
          )}
          <a href={`/${locale}#capture-invitation`}>{labels.openCapture}</a>
        </div>
      )}
    </section>
  );
}

export function CaptureCompletionForm({
  labels,
  locale,
  runId,
}: {
  labels: CaptureLabels;
  locale: "en" | "es";
  runId: string;
}) {
  const [state, action, pending] = useActionState(
    async (
      _previous: CaptureResultState,
      form: FormData,
    ): Promise<CaptureResultState> => {
      if (form.get("keepLink") === "yes") return { status: "idle" };
      try {
        return await revealCapturedInvitationAction({ status: "idle" }, form);
      } catch {
        return { status: "error" };
      }
    },
    { status: "idle" } as CaptureResultState,
  );
  return (
    <form action={action} data-testid="capture-completion-form">
      <input name="locale" type="hidden" value={locale} />
      <input name="runId" type="hidden" value={runId} />
      {pending && <p role="status">{labels.revealing}</p>}
      {state.status === "success" ? (
        <CaptureResult labels={labels} state={state} />
      ) : state.status === "legacy" ? (
        <>
          <p role="status">{labels.legacyWarning}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            <button
              style={buttonStyle}
              disabled={pending}
              name="confirmReplacement"
              value="yes"
              type="submit"
            >
              {labels.replaceLink}
            </button>
            <button
              style={quietButtonStyle}
              disabled={pending}
              name="keepLink"
              value="yes"
              type="submit"
            >
              {labels.keepLink}
            </button>
          </div>
        </>
      ) : state.status === "unavailable" ? (
        <div role="status">
          <p>{labels[state.reason]}</p>
          <p style={{ overflowWrap: "anywhere" }}>
            {labels.reference} <code>{runId}</code>
          </p>
          <a href={`/${locale}#capture-invitation`}>{labels.openCapture}</a>
        </div>
      ) : (
        <>
          {state.status === "error" && (
            <p role="alert">{labels.completionFailed}</p>
          )}
          <button
            data-testid="capture-reveal"
            disabled={pending}
            style={buttonStyle}
            type="submit"
          >
            {state.status === "error" ? labels.retryReveal : labels.reveal}
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
  const remembered = invitationRememberedContext(state.structured);
  return (
    <div style={{ marginTop: "1rem" }}>
      <CaptureSuccessAnnouncement label={labels.result} />
      <p style={{ ...labelStyle, color: teal }}>{labels.result}</p>
      {remembered.length > 0 ? (
        <p data-testid="capture-remembered" style={{ margin: "0.5rem 0" }}>
          <strong>{labels.remembered}:</strong> {remembered.join("; ")}
        </p>
      ) : null}
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
      {copyState === "failed" && (
        <input
          aria-label={label}
          readOnly
          value={value}
          style={fieldStyle}
          onFocus={(event) => event.currentTarget.select()}
        />
      )}
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
