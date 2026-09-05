import { withdrawInvitation, type CancellationInput } from "./cancellation";
import { requestsCancellationReview } from "./cancellation-intent";
import { getAgentClient } from "@/agent/client";
import { schedulerForHome } from "@/agent/scheduler";
import { DbDemoClock, SystemClock } from "@/core/clock";
import { getDatabaseConnection } from "@/core/db/client";
import { evaluateOverlap } from "@/core/policy/evaluate-overlap";
import { applyGuestReconfirmation } from "@/core/reconfirmation/apply-guest-answer";
import { recommendRoomsWithOverflow } from "@/core/rooms/recommendation";
import { loadPartyRoomPreferences } from "@/core/memory/room-preferences";
import type { MemoryClient } from "@/core/memory/client";
import {
  explainRoomPreferences,
  type RoomPreferenceExplanation,
} from "@/core/rooms/preferences";
import {
  loadGuestRoomSearchWindow,
  roomOptionsForStay,
} from "@/core/rooms/search";
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

export interface GuestSearchCriteria {
  from: string;
  to: string;
  nights: number;
  adults: number;
  children: number;
  pets: number;
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
  const broadDraft = {
    stay: [input.from, input.to] as const,
    adults: input.adults,
    children: input.children,
    pets: input.pets,
    specialRequests: [] as string[],
  };
  const options: GuestOption[] = [];
  const lastDeparture = utcDate(input.to);
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

  for (
    let start = utcDate(input.from);
    addDays(start, input.nights) <= lastDeparture &&
    options.length < MAX_VISIT_OPTIONS;
    start = addDays(start, 1)
  ) {
    const stay = [isoDay(start), isoDay(addDays(start, input.nights))] as const;
    const draft = { ...broadDraft, stay };
    const state = {
      home: windowState.home,
      rooms: [] as { id: string; name: string; beds: number }[],
      visits: windowState.visits,
    };
    const availableRooms = roomOptionsForStay(windowState, stay);
    state.rooms = availableRooms.map((room) => ({
      id: room.id,
      name: room.guestLabel,
      beds: room.standardCapacity,
    }));
    const verdict = evaluateOverlap(draft, state);
    const partySize = input.adults + input.children;
    const recommendation = recommendRoomsWithOverflow(
      availableRooms,
      partySize,
      preferences.preferences,
    );
    const effectiveVerdict =
      verdict.decision === "deny" &&
      verdict.reason === "beds" &&
      recommendation?.usesOverflow
        ? evaluateOverlap(draft, {
            ...state,
            rooms: availableRooms.map((room) => ({
              id: room.id,
              name: room.guestLabel,
              beds: room.maximumCapacity,
            })),
          })
        : verdict;
    if (effectiveVerdict.decision !== "deny" && recommendation) {
      options.push({
        stay,
        rooms: availableRooms.map(toGuestRoomChoice),
        recommendedRoomIds: recommendation.rooms.map(({ id }) => id),
        preferenceExplanation: explainRoomPreferences(
          preferences,
          recommendation.rooms,
        ),
        hasOverlap: state.visits.some(
          (visit) =>
            visit.status !== "cancelled" && rangesOverlap(stay, visit.stay),
        ),
      });
    }
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

  const connection = getDatabaseConnection();
  const [home] = await connection.sql<{ demo: boolean }[]>`
    select demo from public.homes where id = ${invitation.homeId}
  `;
  if (!home) return false;
  const clock = await DbDemoClock.load(invitation.homeId, connection.db);
  await applyGuestReconfirmation(
    connection.db,
    clock,
    schedulerForHome({ homeDemo: home.demo }),
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

function utcDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function addDays(value: Date, days: number): Date {
  const result = new Date(value);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function isoDay(value: Date): string {
  return value.toISOString().slice(0, 10);
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
  const connection = getDatabaseConnection();
  const [home] = await connection.sql<
    { demo: boolean }[]
  >`select demo from public.homes where id = ${invitation.homeId}`;
  if (!home) throw new Error("Household not found");
  await withdrawInvitation(
    connection.db,
    {
      homeId: invitation.homeId,
      invitationId: invitation.id,
      actor: { kind: "guest", partyId: invitation.partyId },
      ...review,
    },
    schedulerForHome({ homeDemo: home.demo }),
  );
}
