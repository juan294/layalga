"use client";

import { useFormStatus } from "react-dom";

export function GuestActionButton({
  ariaLabel,
  className,
  label,
  pendingLabel,
  testId,
}: {
  /** Tells apart buttons that share a visible label; it must contain that label. */
  ariaLabel?: string;
  className: string;
  label: string;
  pendingLabel: string;
  testId: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      aria-disabled={pending}
      aria-label={pending ? undefined : ariaLabel}
      className={className}
      data-testid={testId}
      disabled={pending}
      type="submit"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
