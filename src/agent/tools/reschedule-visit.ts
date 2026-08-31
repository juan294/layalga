import { tool } from "@strands-agents/sdk";
import { z } from "zod";

import { rescheduleVisit } from "@/core/booking/holds";

import type { AgentDeps } from "../ports";
import { staySchema } from "../schemas";
import {
  MAX_ADULTS,
  MAX_CHILDREN,
  MAX_PETS,
  MAX_SPECIAL_REQUEST_LENGTH,
  MAX_SPECIAL_REQUESTS,
} from "../task-limits";
import { audit, homeIdForVisit } from "./shared";

export function rescheduleVisitTool(deps: AgentDeps) {
  return tool({
    name: "reschedule_visit",
    description:
      "Move an existing visit to new dates and reallocate rooms. Policy runs first and a changed approved stay may require a new host decision.",
    inputSchema: z.object({
      visitId: z.uuid(),
      stay: staySchema,
      adults: z.int().min(1).max(MAX_ADULTS).optional(),
      children: z.int().min(0).max(MAX_CHILDREN).optional(),
      pets: z.int().min(0).max(MAX_PETS).optional(),
      specialRequests: z
        .array(z.string().max(MAX_SPECIAL_REQUEST_LENGTH))
        .max(MAX_SPECIAL_REQUESTS)
        .optional(),
      approvedBy: z.uuid().optional(),
    }),
    callback: async (input, context) => {
      const trustedInput = input as typeof input & {
        roomIds?: string[];
        overflowConsent?: boolean;
      };
      const visit = await rescheduleVisit(
        deps.db,
        deps.clock,
        trustedInput,
        deps.scheduler,
      );
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
