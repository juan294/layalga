import type { GuestVisitStatus } from "@/app/[locale]/g/[token]/guest-data";

export interface GuestVisitPresentationInput {
  status: GuestVisitStatus;
  preArrival: boolean;
  holdExpired: boolean;
}

export function guestVisitPresentation(input: GuestVisitPresentationInput): {
  canChange: boolean;
  statusKey: GuestVisitStatus | "holdExpired";
  holdMessageKey: "holdActiveBody" | "holdExpiredBody" | null;
} {
  return {
    canChange: input.status !== "cancelled" && input.preArrival,
    statusKey:
      input.status === "hold" && input.holdExpired
        ? "holdExpired"
        : input.status,
    holdMessageKey:
      input.status !== "hold"
        ? null
        : input.holdExpired
          ? "holdExpiredBody"
          : "holdActiveBody",
  };
}
