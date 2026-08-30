import { tool } from "@strands-agents/sdk";
import { z } from "zod";

import { createTemporaryHold } from "@/core/booking/holds";

import type { AgentDeps } from "../ports";
import { staySchema } from "../schemas";
import {
  MAX_ADULTS,
  MAX_ARRIVAL_TIME_LENGTH,
  MAX_CHILDREN,
  MAX_PETS,
  MAX_SPECIAL_REQUEST_LENGTH,
  MAX_SPECIAL_REQUESTS,
} from "../task-limits";
import { audit, homeIdForInvitation } from "./shared";

export function createTemporaryHoldTool(deps: AgentDeps) {
  return tool({
    name: "create_temporary_hold",
    description:
      "Place a temporary 48-hour hold on rooms for a party and stay. Policy runs before this tool; execution means the stay is allowed or a host approved it.",
    inputSchema: z.object({
      invitationId: z.uuid(),
      stay: staySchema,
      adults: z.int().min(1).max(MAX_ADULTS),
      children: z.int().min(0).max(MAX_CHILDREN).default(0),
      pets: z.int().min(0).max(MAX_PETS).default(0),
      arrivalTime: z.string().max(MAX_ARRIVAL_TIME_LENGTH).optional(),
      specialRequests: z
        .array(z.string().max(MAX_SPECIAL_REQUEST_LENGTH))
        .max(MAX_SPECIAL_REQUESTS)
        .default([]),
      approvedBy: z.uuid().optional(),
    }),
    callback: async (input, context) => {
      const visit = await createTemporaryHold(deps.db, deps.clock, input);
      const homeId = await homeIdForInvitation(deps, input.invitationId);
      await audit(deps, homeId, context, "tool_call", {
        name: "create_temporary_hold",
        visitId: visit.visitId,
      });
      return {
        visitId: visit.visitId,
        rooms: visit.allocation,
        holdExpiresAt: new Date(
          deps.clock.now().getTime() + 48 * 60 * 60 * 1_000,
        ).toISOString(),
      };
    },
  });
}
