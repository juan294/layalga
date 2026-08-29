import { tool } from "@strands-agents/sdk";
import { z } from "zod";

import { createTemporaryHold } from "@/core/booking/holds";

import type { AgentDeps } from "../ports";
import { staySchema } from "../schemas";
import { audit, homeIdForInvitation } from "./shared";

export function createTemporaryHoldTool(deps: AgentDeps) {
  return tool({
    name: "create_temporary_hold",
    description:
      "Place a temporary 48-hour hold on rooms for a party and stay. Policy runs before this tool; execution means the stay is allowed or a host approved it.",
    inputSchema: z.object({
      invitationId: z.uuid(),
      stay: staySchema,
      adults: z.int().min(1),
      children: z.int().min(0).default(0),
      pets: z.int().min(0).default(0),
      arrivalTime: z.string().optional(),
      specialRequests: z.array(z.string()).default([]),
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
