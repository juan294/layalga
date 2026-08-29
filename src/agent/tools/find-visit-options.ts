import { tool } from "@strands-agents/sdk";
import { z } from "zod";

import { sqlClient } from "@/core/db/client";
import { evaluateOverlap } from "@/core/policy/evaluate-overlap";

import type { AgentDeps } from "../deps";
import { isoDateSchema } from "../schemas";
import { audit, homeIdForInvitation, loadHouseState } from "./shared";

const MAX_WINDOW_DAYS = 90;

export function findVisitOptionsTool(deps: AgentDeps) {
  return tool({
    name: "find_visit_options",
    description:
      "Find candidate stays in a date window and report capacity plus anonymous overlap details without naming another party.",
    inputSchema: z.object({
      invitationId: z.uuid(),
      window: z
        .object({
          from: isoDateSchema,
          to: isoDateSchema,
        })
        .refine(
          ({ from, to }) => windowDays(from, to) >= 0,
          "Window end must not be before its start",
        )
        .refine(
          ({ from, to }) => windowDays(from, to) <= MAX_WINDOW_DAYS,
          `Window must not exceed ${MAX_WINDOW_DAYS} days`,
        ),
      nights: z.int().min(1).max(30),
    }),
    callback: async (input, context) => {
      const sql = sqlClient(deps.db);
      const homeId = await homeIdForInvitation(deps, input.invitationId);
      const [invitation] = await sql<
        { structured: Record<string, unknown> }[]
      >`select structured from public.invitations where id = ${input.invitationId}`;
      const party = invitation?.structured ?? {};
      const windowDraft = {
        stay: [input.window.from, input.window.to] as const,
        adults: number(party.adults, 1),
        children: number(party.children, 0),
        pets: number(party.pets, 0),
        specialRequests: [] as string[],
      };
      const windowState = await loadHouseState(deps, homeId, windowDraft);
      const candidates = [];
      for (
        let start = new Date(`${input.window.from}T00:00:00Z`);
        addDays(start, input.nights) <=
        new Date(`${input.window.to}T00:00:00Z`);
        start = addDays(start, 1)
      ) {
        const stay = [date(start), date(addDays(start, input.nights))] as const;
        const draft = {
          stay,
          adults: windowDraft.adults,
          children: windowDraft.children,
          pets: windowDraft.pets,
          specialRequests: windowDraft.specialRequests,
        };
        const state = {
          ...windowState,
          visits: windowState.visits.filter((visit) =>
            overlaps(visit.stay, stay),
          ),
        };
        const verdict = evaluateOverlap(draft, state);
        if (verdict.decision !== "deny") {
          const overlaps = state.visits
            .filter((visit) => visit.status !== "cancelled")
            .map(
              (visit) =>
                `another party: ${visit.adults} adults, ${visit.children} children, ${visit.pets} pets`,
            );
          candidates.push({ stay, rooms: verdict.allocation, overlaps });
        }
      }
      await audit(deps, homeId, context, "tool_call", {
        name: "find_visit_options",
        candidateCount: candidates.length,
      });
      return { candidates };
    },
  });
}

function windowDays(from: string, to: string): number {
  return (
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
    86_400_000
  );
}

function overlaps(
  left: readonly [string | Date, string | Date],
  right: readonly [string, string],
): boolean {
  return (
    toTime(left[0]) < toTime(right[1]) && toTime(right[0]) < toTime(left[1])
  );
}

function toTime(value: string | Date): number {
  return value instanceof Date
    ? value.getTime()
    : Date.parse(`${value}T00:00:00Z`);
}

function addDays(value: Date, days: number): Date {
  const result = new Date(value);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function date(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function number(value: unknown, fallback: number): number {
  return typeof value === "number" ? value : fallback;
}
