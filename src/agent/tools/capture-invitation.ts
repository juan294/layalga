import { tool } from "@strands-agents/sdk";
import { z } from "zod";

import { captureInvitation } from "@/core/booking/invitations";

import type { AgentDeps } from "../deps";
import { audit } from "./shared";

export function captureInvitationTool(deps: AgentDeps) {
  return tool({
    name: "capture_invitation",
    description:
      "Structure a host's invitation, create or reuse the invited party, and return the private guest link.",
    inputSchema: z.object({
      homeId: z.uuid(),
      hostId: z.uuid(),
      partyName: z.string().min(1),
      partyLocale: z.enum(["en", "es"]),
      adults: z.int().min(1),
      children: z.int().min(0).default(0),
      pets: z.int().min(0).default(0),
      flexibleDates: z.object({
        text: z.string(),
        earliest: z.string().optional(),
        latest: z.string().optional(),
      }),
      arrivalTime: z.string().optional(),
      specialRequests: z.array(z.string()).default([]),
      rawMessage: z.string().min(1),
    }),
    callback: async (input, context) => {
      const invitation = await captureInvitation(deps.db, {
        homeId: input.homeId,
        hostId: input.hostId,
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
      });
      await audit(deps, input.homeId, context, "tool_call", {
        name: "capture_invitation",
        invitationId: invitation.invitationId,
      });
      return invitation;
    },
  });
}
