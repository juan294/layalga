import { tool } from "@strands-agents/sdk";
import { z } from "zod";

import { captureInvitation } from "@/core/booking/invitations";

import type { AgentDeps } from "../ports";
import { audit, requireAuthority } from "./shared";

export function captureInvitationTool(deps: AgentDeps) {
  return tool({
    name: "capture_invitation",
    description:
      "Structure a host's invitation, create or reuse the invited party, and return the private guest link.",
    inputSchema: z.object({
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
