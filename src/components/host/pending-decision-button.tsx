"use client";

import type { CSSProperties } from "react";
import { useFormStatus } from "react-dom";

export function decisionButtonState(
  pending: boolean,
  submittedValue: FormDataEntryValue | null,
  buttonValue: "approve" | "decline",
): { disabled: boolean; active: boolean } {
  return {
    disabled: pending,
    active: pending && submittedValue === buttonValue,
  };
}

export function PendingDecisionButton({
  idleLabel,
  pendingLabel,
  style,
  testId,
  value,
}: {
  idleLabel: string;
  pendingLabel: string;
  style: CSSProperties;
  testId?: string;
  value: "approve" | "decline";
}) {
  const { data, pending } = useFormStatus();
  const state = decisionButtonState(
    pending,
    data?.get("decision") ?? null,
    value,
  );

  return (
    <button
      aria-disabled={state.disabled}
      data-testid={testId}
      disabled={state.disabled}
      name="decision"
      style={{ ...style, opacity: state.disabled ? 0.55 : 1 }}
      type="submit"
      value={value}
    >
      {state.active ? pendingLabel : idleLabel}
    </button>
  );
}

export function PendingDecisionRetryButton({
  idleLabel,
  pendingLabel,
  style,
}: {
  idleLabel: string;
  pendingLabel: string;
  style: CSSProperties;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      aria-disabled={pending}
      data-testid="retry-decision"
      disabled={pending}
      style={{ ...style, opacity: pending ? 0.55 : 1 }}
      type="submit"
    >
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}
