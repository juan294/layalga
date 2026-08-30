import { tool } from "@strands-agents/sdk";
import { z } from "zod";

import { evaluateOverlap } from "@/core/policy/evaluate-overlap";

import type { AgentDeps } from "../ports";
import { staySchema } from "../schemas";
import {
  MAX_ADULTS,
  MAX_CHILDREN,
  MAX_PETS,
  MAX_SPECIAL_REQUEST_LENGTH,
  MAX_SPECIAL_REQUESTS,
} from "../task-limits";
import { audit, homeIdForInvitation, loadHouseState } from "./shared";

export function evaluateOverlapTool(deps: AgentDeps) {
  return tool({
    name: "evaluate_overlap",
    description:
      "Check beds, children, pets, and special-request policy for a proposed stay without changing a booking.",
    inputSchema: z.object({
      invitationId: z.uuid(),
      stay: staySchema,
      adults: z.int().min(1).max(MAX_ADULTS),
      children: z.int().min(0).max(MAX_CHILDREN).default(0),
      pets: z.int().min(0).max(MAX_PETS).default(0),
      specialRequests: z
        .array(z.string().max(MAX_SPECIAL_REQUEST_LENGTH))
        .max(MAX_SPECIAL_REQUESTS)
        .default([]),
    }),
    callback: async (input, context) => {
      const draft = input;
      const homeId = await homeIdForInvitation(deps, input.invitationId);
      const verdict = evaluateOverlap(
        draft,
        await loadHouseState(deps, homeId, draft),
      );
      await audit(deps, homeId, context, "tool_call", {
        name: "evaluate_overlap",
        decision: verdict.decision,
      });
      return verdict;
    },
  });
}
