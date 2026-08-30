import { tool } from "@strands-agents/sdk";
import { z } from "zod";

import { captureInvitation } from "@/core/booking/invitations";

import type { AgentDeps } from "../ports";
import {
  MAX_ADULTS,
  MAX_ARRIVAL_TIME_LENGTH,
  MAX_CHILDREN,
  MAX_FLEXIBLE_DATE_TEXT_LENGTH,
  MAX_HOST_MESSAGE_LENGTH,
  MAX_PARTY_NAME_LENGTH,
  MAX_PETS,
  MAX_SPECIAL_REQUEST_LENGTH,
  MAX_SPECIAL_REQUESTS,
} from "../task-limits";
import { audit, requireAuthority } from "./shared";

export function captureInvitationTool(deps: AgentDeps) {
  return tool({
    name: "capture_invitation",
    description:
      "Structure a host's invitation, create or reuse the invited party, and return the private guest link.",
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
      rawMessage: z.string().min(1).max(MAX_HOST_MESSAGE_LENGTH),
    }),
    callback: async (input, context) => {
      const authority = requireAuthority(deps);
      if (!authority.hostId) {
        throw new Error("Host capture authority is required");
      }
      const invitation = await captureInvitation(deps.db, {
        homeId: authority.homeId,
        hostId: authority.hostId,
        partyName: input.partyName,
        partyLocale: input.partyLocale,
        rawMessage: input.rawMessage,
        structured: {
          adults: input.adults,
          children: input.children,
          pets: input.pets,
          flexibleDates: input.flexibleDates,
          arrivalTime: input.arrivalTime,
          specialRequests: input.specialRequests,
        },
        appUrl: deps.appUrl,
        now: deps.clock.now(),
      });
      await audit(deps, authority.homeId, context, "tool_call", {
        name: "capture_invitation",
        invitationId: invitation.invitationId,
      });
      return {
        invitationId: invitation.invitationId,
        partyId: invitation.partyId,
      };
    },
  });
}
