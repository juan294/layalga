import { tool } from "@strands-agents/sdk";
import { z } from "zod";

import {
  captureInvitation,
  captureForRun,
  type CaptureInvitationInput,
} from "@/core/booking/invitations";
import { foldText } from "@/lib/text-fold";

import type { AgentDeps } from "../ports";
import {
  MAX_ADULTS,
  MAX_ARRIVAL_TIME_LENGTH,
  MAX_CHILDREN,
  MAX_FLEXIBLE_DATE_TEXT_LENGTH,
  MAX_HOST_MESSAGE_LENGTH,
  MAX_PARTY_NAME_LENGTH,
  MAX_PETS,
  MAX_REMEMBERED_CONTEXT,
  MAX_REMEMBERED_CONTEXT_LENGTH,
  MAX_SPECIAL_REQUEST_LENGTH,
  MAX_SPECIAL_REQUESTS,
} from "../task-limits";
import { audit, requireAuthority } from "./shared";

export function captureInvitationTool(deps: AgentDeps) {
  let failure: Error | undefined;
  function failCapture(error: unknown): never {
    failure = error instanceof Error ? error : new Error("Capture failed");
    deps.onCaptureFailure?.(failure);
    throw failure;
  }
  return tool({
    name: "capture_invitation",
    description:
      "Structure a host's invitation and create or reuse the invited party. Call it once per host message; the application delivers the private guest link outside this conversation.",
    inputSchema: z.object({
      partyName: z.string().min(1).max(MAX_PARTY_NAME_LENGTH),
      partyLocale: z.enum(["en", "es"]),
      adults: z.int().min(1).max(MAX_ADULTS),
      children: z.int().min(0).max(MAX_CHILDREN).default(0),
      pets: z.int().min(0).max(MAX_PETS).default(0),
      flexibleDates: z.object({
        text: z.string().max(MAX_FLEXIBLE_DATE_TEXT_LENGTH),
        earliest: z.string().optional(),
        latest: z.string().optional(),
      }),
      arrivalTime: z.string().max(MAX_ARRIVAL_TIME_LENGTH).optional(),
      specialRequests: z
        .array(z.string().max(MAX_SPECIAL_REQUEST_LENGTH))
        .max(MAX_SPECIAL_REQUESTS)
        .default([]),
      // Informational recall only (D7 continued): what search_memory found
      // about this family. Never merged into adults, children, pets, dates,
      // arrivalTime, or specialRequests -- the guard below removes any
      // specialRequests entry that only restates a rememberedContext entry,
      // and nothing else in the codebase reads this field except the host
      // capture summary display. The limits are enforced by truncation in
      // the callback, not by schema rejection: a recall one character too
      // long made a production run fail validation and retry the tool.
      rememberedContext: z
        .array(
          z
            .string()
            .describe(
              `One short recalled fact, at most ${MAX_REMEMBERED_CONTEXT_LENGTH} characters`,
            ),
        )
        .describe(`At most ${MAX_REMEMBERED_CONTEXT} entries`)
        .optional(),
      rawMessage: z.string().min(1).max(MAX_HOST_MESSAGE_LENGTH),
    }),
    callback: async (input, context) => {
      if (failure) throw failure;
      const authority = requireAuthority(deps);
      if (!authority.hostId) {
        throw new Error("Host capture authority is required");
      }
      if (
        context?.invocationState.runId &&
        deps.captureLease?.runId !== context.invocationState.runId
      )
        throw new Error("A claimed capture run is required");
      const rememberedContext = (
        authority.partyId ? (input.rememberedContext ?? []) : []
      )
        .slice(0, MAX_REMEMBERED_CONTEXT)
        .map((entry) => entry.slice(0, MAX_REMEMBERED_CONTEXT_LENGTH));
      // Deterministic guard: a specialRequest that only echoes a recalled
      // fact (case/diacritic-insensitive exact match) is not something the
      // host's message stated, so it must not reach booking policy. This is
      // an exact match, not a substring or fuzzy one: an entry the host
      // restated in this exact wording is still treated as remembered (and
      // dropped), but a policy-relevant request that differs in wording --
      // even about the same topic -- is not caught by this filter and
      // survives into specialRequests, exactly as the host wrote it.
      const foldedRemembered = new Set(rememberedContext.map(foldText));
      const specialRequests = input.specialRequests.filter(
        (request) => !foldedRemembered.has(foldText(request)),
      );
      const details: CaptureInvitationInput = {
        homeId: authority.homeId,
        hostId: authority.hostId,
        partyName: input.partyName,
        returningPartyId: authority.partyId,
        partyLocale: input.partyLocale,
        rawMessage: input.rawMessage,
        structured: {
          adults: input.adults,
          children: input.children,
          pets: input.pets,
          flexibleDates: input.flexibleDates,
          arrivalTime: input.arrivalTime,
          specialRequests,
          ...(rememberedContext.length > 0 ? { rememberedContext } : {}),
        },
        appUrl: deps.appUrl,
        now: deps.clock.now(),
      };
      const invitation = await (
        deps.captureLease
          ? captureForRun(deps.db, details, deps.captureLease)
          : captureInvitation(deps.db, details)
      ).catch(failCapture);
      await audit(deps, authority.homeId, context, "tool_call", {
        name: "capture_invitation",
        invitationId: invitation.invitationId,
      }).catch(failCapture);
      return {
        invitationId: invitation.invitationId,
        partyId: invitation.partyId,
      };
    },
  });
}
