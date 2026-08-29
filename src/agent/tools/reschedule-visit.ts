import { tool } from "@strands-agents/sdk";
import { z } from "zod";

import { rescheduleVisit } from "@/core/booking/holds";

import type { AgentDeps } from "../deps";
import { staySchema } from "../schemas";
import { audit, homeIdForVisit } from "./shared";

export function rescheduleVisitTool(deps: AgentDeps) {
  return tool({
    name: "reschedule_visit",
    description:
      "Move an existing visit to new dates and reallocate rooms. Policy runs first and a changed approved stay may require a new host decision.",
    inputSchema: z.object({
      visitId: z.uuid(),
      stay: staySchema,
      adults: z.int().min(1).optional(),
      children: z.int().min(0).optional(),
      pets: z.int().min(0).optional(),
      specialRequests: z.array(z.string()).optional(),
      approvedBy: z.uuid().optional(),
    }),
    callback: async (input, context) => {
      const visit = await rescheduleVisit(deps.db, deps.clock, input);
      await audit(
        deps,
        await homeIdForVisit(deps, input.visitId),
        context,
        "tool_call",
        {
          name: "reschedule_visit",
          visitId: input.visitId,
        },
      );
      return visit;
    },
  });
}
