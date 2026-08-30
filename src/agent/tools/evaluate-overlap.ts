import { tool } from "@strands-agents/sdk";
import { z } from "zod";

import { evaluateOverlap } from "@/core/policy/evaluate-overlap";

import type { AgentDeps } from "../ports";
import { staySchema } from "../schemas";
import { audit, homeIdForInvitation, loadHouseState } from "./shared";

export function evaluateOverlapTool(deps: AgentDeps) {
  return tool({
    name: "evaluate_overlap",
    description:
      "Check beds, children, pets, and special-request policy for a proposed stay without changing a booking.",
    inputSchema: z.object({
      invitationId: z.uuid(),
      stay: staySchema,
      adults: z.int().min(1),
      children: z.int().min(0).default(0),
      pets: z.int().min(0).default(0),
      specialRequests: z.array(z.string()).default([]),
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
