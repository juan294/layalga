"use client";

import { startTransition, useActionState, type ComponentProps } from "react";

import type { RoomActionState } from "@/app/[locale]/(host)/room-actions";

export interface RoomActionLabels {
  pending: string;
  saved: string;
  errors: Record<"invalid" | "conflict" | "failed", string>;
}

export function RoomActionForm({
  action,
  labels,
  children,
  ...props
}: Omit<ComponentProps<"form">, "action" | "onSubmit"> & {
  action: (data: FormData) => Promise<RoomActionState>;
  labels: RoomActionLabels;
}) {
  const [state, dispatch, pending] = useActionState(
    (_previous: RoomActionState, data: FormData) => action(data),
    { status: "idle" },
  );

  return (
    <form
      {...props}
      action={dispatch}
      aria-busy={pending}
      onSubmit={(event) => {
        event.preventDefault();
        if (pending) return;
        const data = new FormData(event.currentTarget);
        // A native React action resets uncontrolled fields even on a returned
        // validation error. Dispatch explicitly so hosts can correct their input.
        startTransition(() => dispatch(data));
      }}
    >
      <fieldset disabled={pending} style={{ display: "contents" }}>
        {children}
      </fieldset>
      {pending ? <p role="status">{labels.pending}</p> : null}
      {!pending && state.status === "saved" ? (
        <p role="status">{labels.saved}</p>
      ) : null}
      {!pending && state.status === "error" ? (
        <p role="alert">{labels.errors[state.error]}</p>
      ) : null}
    </form>
  );
}
