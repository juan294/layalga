// design-sync preview shim for `@/app/[locale]/g/[token]/actions` -- see the
// host-actions shim for why. Types come from the real module.
import type {
  GuestOption,
  GuestOptionState,
  GuestSubmitState,
} from "../../src/app/[locale]/g/[token]/actions";

export type { GuestOption, GuestOptionState, GuestSubmitState };

export async function findGuestOptions(
  _previous: GuestOptionState,
  _formData: FormData,
): Promise<GuestOptionState> {
  return { status: "idle", options: [] };
}

export async function submitGuestVisit(
  _previous: GuestSubmitState,
  _formData: FormData,
): Promise<GuestSubmitState> {
  return { status: "idle" };
}

export async function requestGuestChange(_formData: FormData): Promise<void> {}

export async function reconfirmGuest(_formData: FormData): Promise<void> {}
