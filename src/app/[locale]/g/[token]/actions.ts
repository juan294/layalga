"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { getAgentClient } from "@/agent/client";
import { schedulerForHome } from "@/agent/scheduler";
import {
  MAX_ADULTS,
  MAX_ARRIVAL_TIME_LENGTH,
  MAX_CHILDREN,
  MAX_GUEST_MESSAGE_LENGTH,
  MAX_GUEST_NOTES_LENGTH,
  MAX_PETS,
} from "@/agent/task-limits";
import { DbDemoClock, SystemClock } from "@/core/clock";
import {
  MAX_VISIT_OPTIONS,
  optionWindowIsAllowed,
} from "@/core/booking/option-window";
import { getDatabaseConnection } from "@/core/db/client";
import { evaluateOverlap } from "@/core/policy/evaluate-overlap";
import { MAX_ROOM_SELECTION } from "@/core/rooms/limits";
import { recommendRoomsWithOverflow } from "@/core/rooms/recommendation";
import {
  loadGuestRoomSearchWindow,
  roomOptionsForStay,
} from "@/core/rooms/search";
import { applyGuestReconfirmation } from "@/core/reconfirmation/apply-guest-answer";
import {
  toGuestRoomChoice,
  type GuestRoomChoice,
} from "@/components/guest/guest-room-contract";
import {
  reportActionError,
  reportedActionError,
} from "@/lib/server/action-errors";

import {
  loadGuestInvitation,
  resolveGuestInvitationAuthority,
} from "./guest-data";

const optionInput = z
  .object({
    token: z.string().min(1),
    locale: z.enum(["en", "es"]),
    from: z.iso.date(),
    to: z.iso.date(),
    nights: z.coerce.number().int().min(1).max(30),
    adults: z.coerce.number().int().min(1).max(MAX_ADULTS),
    children: z.coerce.number().int().min(0).max(MAX_CHILDREN),
    pets: z.coerce.number().int().min(0).max(MAX_PETS),
  })
  .refine(({ from, to }) => optionWindowIsAllowed(from, to), {
    message: "Date window exceeds the maximum",
    path: ["to"],
  });

const submitInput = z.object({
  token: z.string().min(1),
  locale: z.enum(["en", "es"]),
  stay: z.string().regex(/^\d{4}-\d{2}-\d{2}\|\d{4}-\d{2}-\d{2}$/),
  adults: z.coerce.number().int().min(1).max(MAX_ADULTS),
  children: z.coerce.number().int().min(0).max(MAX_CHILDREN),
  pets: z.coerce.number().int().min(0).max(MAX_PETS),
  roomIds: z.array(z.uuid()).min(1).max(MAX_ROOM_SELECTION),
  overflowConsent: z.boolean(),
  arrivalTime: z.string().max(MAX_ARRIVAL_TIME_LENGTH).optional(),
  notes: z.string().max(MAX_GUEST_NOTES_LENGTH).optional(),
});

export interface GuestOption {
  stay: readonly [string, string];
  rooms: GuestRoomChoice[];
  recommendedRoomIds: string[];
  hasOverlap: boolean;
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

export async function findGuestOptions(
  _previous: GuestOptionState,
  formData: FormData,
): Promise<GuestOptionState> {
  const parsed = optionInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success || parsed.data.from >= parsed.data.to) {
    return { status: "error", options: [], error: "invalid" };
  }

  try {
    return await findGuestOptionsForInput(parsed.data);
  } catch (error) {
    reportActionError("guest_options_failed", error);
    return { status: "error", options: [], error: "invalid" };
  }
}

async function findGuestOptionsForInput(
  input: z.infer<typeof optionInput>,
): Promise<GuestOptionState> {
  const invitation = await resolveGuestInvitationAuthority(input.token);
  if (!invitation) {
    return { status: "error", options: [], error: "not_found" };
  }

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
    invitation.homeId,
    [input.from, input.to],
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

export async function submitGuestVisit(
  _previous: GuestSubmitState,
  formData: FormData,
): Promise<GuestSubmitState> {
  const parsed = submitInput.safeParse({
    ...Object.fromEntries(formData),
    roomIds: formData.getAll("roomIds").map(String),
    overflowConsent: formData.get("overflowConsent") === "on",
  });
  if (!parsed.success) return { status: "error", error: "invalid" };

  const invitation = await resolveGuestInvitationAuthority(parsed.data.token);
  if (!invitation) return { status: "error", error: "not_found" };

  const [start, end] = parsed.data.stay.split("|") as [string, string];
  try {
    const result = await getAgentClient().enqueue({
      task: "guest_submit",
      homeId: invitation.homeId,
      invitationId: invitation.id,
      stay: [start, end],
      adults: parsed.data.adults,
      children: parsed.data.children,
      pets: parsed.data.pets,
      roomIds: parsed.data.roomIds,
      ...(parsed.data.overflowConsent ? { overflowConsent: true } : {}),
      arrivalTime: clean(parsed.data.arrivalTime),
      notes: clean(parsed.data.notes),
      locale: parsed.data.locale,
    });
    redirect(
      `/${parsed.data.locale}/runs/${result.runId}/status?returnTo=${encodeURIComponent(
        `/${parsed.data.locale}/g/${parsed.data.token}`,
      )}&token=${encodeURIComponent(parsed.data.token)}`,
    );
  } catch (error) {
    if (isRedirect(error)) throw error;
    reportActionError("guest_submit_failed", error);
    return { status: "error", error: "failed" };
  }
}

export async function requestGuestChange(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const locale = formData.get("locale") === "es" ? "es" : "en";
  const message = String(formData.get("message") ?? "").trim();
  if (message.length > MAX_GUEST_MESSAGE_LENGTH) return;
  try {
    const invitation = await loadGuestInvitation(token, locale);
    if (!invitation?.visit || !message) return;

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
    redirect(
      `/${locale}/runs/${result.runId}/status?returnTo=${encodeURIComponent(
        `/${locale}/g/${token}`,
      )}&token=${encodeURIComponent(token)}`,
    );
  } catch (error) {
    if (isRedirect(error)) throw error;
    throw reportedActionError("guest_change_failed", error);
  }
}

export async function reconfirmGuest(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const locale = formData.get("locale") === "es" ? "es" : "en";
  try {
    const invitation = await loadGuestInvitation(token, locale);
    if (!invitation?.visit) return;
    const visitId = invitation.visit.id;

    const connection = getDatabaseConnection();
    const [home] = await connection.sql<{ demo: boolean }[]>`
      select demo from public.homes where id = ${invitation.homeId}
    `;
    if (!home) return;
    const clock = await DbDemoClock.load(invitation.homeId, connection.db);
    await applyGuestReconfirmation(
      connection.db,
      clock,
      schedulerForHome({ homeDemo: home.demo }),
      invitation.homeId,
      visitId,
      "yes",
    );
    redirect(`/${locale}/g/${token}`);
  } catch (error) {
    if (isRedirect(error)) throw error;
    throw reportedActionError("guest_reconfirm_failed", error);
  }
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

function isRedirect(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof error.digest === "string" &&
    error.digest.startsWith("NEXT_REDIRECT")
  );
}
