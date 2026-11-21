import { withdrawInvitation, type CancellationInput } from "./cancellation";
import { requestsCancellationReview } from "./cancellation-intent";
import { getAgentClient } from "@/agent/client";
import { configuredScheduler } from "@/agent/scheduler";
import { SystemClock } from "@/core/clock";
import { getDatabaseConnection } from "@/core/db/client";
import { applyGuestReconfirmation } from "@/core/reconfirmation/apply-guest-answer";
import { loadPartyRoomPreferences } from "@/core/memory/room-preferences";
import type { MemoryClient } from "@/core/memory/client";
import {
  explainRoomPreferences,
  type RoomPreferenceExplanation,
} from "@/core/rooms/preferences";
import { loadGuestRoomSearchWindow } from "@/core/rooms/search";
import { enumerateStayOptions, type GuestSearchCriteria } from "./stay-options";
export type { GuestSearchCriteria } from "./stay-options";
import { toGuestRoomChoice, type GuestRoomChoice } from "./guest-room-contract";

import {
  type GuestInvitationAuthority,
  type GuestInvitationData,
} from "./guest-invitation";
import { MAX_VISIT_OPTIONS } from "./option-window";

export interface GuestOption {
  stay: readonly [string, string];
  rooms: GuestRoomChoice[];
  recommendedRoomIds: string[];
  hasOverlap: boolean;
  preferenceExplanation?: RoomPreferenceExplanation;
}

export interface GuestOptionState {
  status: "idle" | "success" | "error";
  options: GuestOption[];
  criteria?: GuestSearchCriteria;
  error?: "invalid" | "not_found" | "none";
}

export interface GuestSubmitState {
  status: "idle" | "error";
  error?: "invalid" | "not_found" | "failed";
}

export type FindGuestOptionsAction = (
  previous: GuestOptionState,
  formData: FormData,
) => Promise<GuestOptionState>;

export type SubmitGuestVisitAction = (
  previous: GuestSubmitState,
  formData: FormData,
) => Promise<GuestSubmitState>;

export type GuestFormAction = (formData: FormData) => Promise<void>;

export type ValidatedOptionInput = GuestSearchCriteria;

export interface ValidatedSubmitInput {
  locale: "en" | "es";
  stay: string;
  adults: number;
  children: number;
  pets: number;
  roomIds: string[];
  overflowConsent: boolean;
  arrivalTime?: string;
  notes?: string;
  requests?: string;
}

export async function findGuestOptionsForAuthority(
  authority: GuestInvitationAuthority,
  input: ValidatedOptionInput,
  memoryOptions?: { client?: MemoryClient },
): Promise<GuestOptionState> {
  const connection = getDatabaseConnection();
  const clock = new SystemClock();
  const windowState = await loadGuestRoomSearchWindow(
    connection.db,
    clock,
    authority.homeId,
    [input.from, input.to],
  );
  const preferences = await loadPartyRoomPreferences(
    connection.db,
    { homeId: authority.homeId, partyId: authority.partyId },
    memoryOptions,
  );

  const options: GuestOption[] = [];
  for (const { stay, rooms, recommended } of enumerateStayOptions(
    windowState,
    input,
    preferences.preferences,
  )) {
    options.push({
      stay,
      rooms: rooms.map(toGuestRoomChoice),
      recommendedRoomIds: recommended.map(({ id }) => id),
      preferenceExplanation: explainRoomPreferences(preferences, recommended),
      hasOverlap: windowState.visits.some(
        (visit) =>
          visit.status !== "cancelled" && rangesOverlap(stay, visit.stay),
      ),
    });
    if (options.length >= MAX_VISIT_OPTIONS) break;
  }

  return options.length > 0
    ? {
        status: "success",
        options,
        criteria: {
          from: input.from,
          to: input.to,
          nights: input.nights,
          adults: input.adults,
          children: input.children,
          pets: input.pets,
        },
      }
    : { status: "error", options: [], error: "none" };
}

export async function submitGuestVisitForAuthority(
  authority: GuestInvitationAuthority,
  input: ValidatedSubmitInput,
): Promise<{ runId: string }> {
  const [start, end] = input.stay.split("|") as [string, string];
  const result = await getAgentClient().enqueue({
    task: "guest_submit",
    homeId: authority.homeId,
    invitationId: authority.id,
    stay: [start, end],
    adults: input.adults,
    children: input.children,
    pets: input.pets,
    roomIds: input.roomIds,
    ...(input.overflowConsent ? { overflowConsent: true } : {}),
    arrivalTime: clean(input.arrivalTime),
    notes: clean(input.notes),
    requests: clean(input.requests),
    locale: input.locale,
  });
  return { runId: result.runId };
}

export async function requestGuestChangeCore(
  invitation: GuestInvitationData,
  message: string,
  locale: "en" | "es",
): Promise<
  | { runId: string; cancellationRequested?: never }
  | { cancellationRequested: true; runId?: never }
  | null
> {
  if (requestsCancellationReview(message))
    return { cancellationRequested: true };
  if (!invitation.visit || !message) return null;

  const result =
    invitation.visit.status === "reconfirm_pending"
      ? await getAgentClient().enqueue({
          task: "guest_reconfirm",
          homeId: invitation.homeId,
          visitId: invitation.visit.id,
          answer: "change",
          message,
        })
      : await getAgentClient().enqueue({
          task: "guest_change",
          homeId: invitation.homeId,
          visitId: invitation.visit.id,
          message,
          locale,
        });
  return { runId: result.runId };
}

export async function reconfirmGuestCore(
  invitation: GuestInvitationData,
): Promise<boolean> {
  if (!invitation.visit) return false;

  await applyGuestReconfirmation(
    getDatabaseConnection().db,
    new SystemClock(),
    configuredScheduler(),
    invitation.homeId,
    invitation.visit.id,
    "yes",
  );
  return true;
}

function clean(value: string | undefined): string | undefined {
  const result = value?.trim();
  return result || undefined;
}

function rangesOverlap(
  left: readonly [string, string],
  right: readonly [string | Date, string | Date],
): boolean {
  return (
    String(left[0]) < String(right[1]) && String(right[0]) < String(left[1])
  );
}

export async function cancelGuestInvitationCore(
  invitation: GuestInvitationData,
  review: Pick<CancellationInput, "expectedVisitId" | "expectedStay">,
): Promise<void> {
  await withdrawInvitation(
    getDatabaseConnection().db,
    {
      homeId: invitation.homeId,
      invitationId: invitation.id,
      actor: { kind: "guest", partyId: invitation.partyId },
      ...review,
    },
    configuredScheduler(),
  );
}
