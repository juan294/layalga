import { tool } from "@strands-agents/sdk";
import { z } from "zod";

import { confirmVisit } from "@/core/booking/holds";

import type { AgentDeps } from "../deps";
import { audit, homeIdForVisit } from "./shared";

export function confirmVisitTool(deps: AgentDeps) {
  return tool({
    name: "confirm_visit",
    description:
      "Confirm an existing temporary hold after current overlap policy allows it or a host approves it.",
    inputSchema: z.object({
      visitId: z.uuid(),
      approvedBy: z.uuid().optional(),
    }),
    callback: async (input, context) => {
      const visit = await confirmVisit(deps.db, deps.clock, input.visitId, input.approvedBy);
      await audit(deps, await homeIdForVisit(deps, input.visitId), context, "tool_call", {
        name: "confirm_visit",
        visitId: input.visitId,
      });
      return visit;
    },
  });
}
