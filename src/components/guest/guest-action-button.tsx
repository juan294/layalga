"use client";

import { useFormStatus } from "react-dom";

export function GuestActionButton({
  className,
  label,
  pendingLabel,
  testId,
}: {
  className: string;
  label: string;
  pendingLabel: string;
  testId: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      aria-disabled={pending}
      className={className}
      data-testid={testId}
      disabled={pending}
      type="submit"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
