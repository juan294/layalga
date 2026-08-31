import { tool } from "@strands-agents/sdk";
import { z } from "zod";

import {
  MAX_PROPOSAL_ROOMS,
  MAX_PROPOSAL_SUMMARY_LENGTH,
  prepareRoomActionProposal,
} from "@/core/rooms/proposals";

import type { AgentDeps } from "../ports";
import { staySchema } from "../schemas";
import { audit, requireAuthority } from "./shared";

export function prepareRoomActionTool(deps: AgentDeps) {
  return tool({
    name: "prepare_room_action",
    description:
      "Prepare one pending private block, room opening, or room closure for visible host review. This never applies the room change.",
    inputSchema: z.object({
      kind: z.enum(["private_block", "open", "close"]),
      stay: staySchema,
      roomIds: z.array(z.uuid()).min(1).max(MAX_PROPOSAL_ROOMS),
      summary: z.string().min(1).max(MAX_PROPOSAL_SUMMARY_LENGTH),
    }),
    callback: async (input, context) => {
      const authority = requireAuthority(deps);
      if (!authority.hostId) {
        throw new Error("Host authority is required to prepare a room action");
      }
      const runId = context?.invocationState.runId;
      if (typeof runId !== "string") {
        throw new Error(
          "A trusted agent run is required to prepare a room action",
        );
      }
      const proposal = await prepareRoomActionProposal(deps.db, {
        homeId: authority.homeId,
        hostId: authority.hostId,
        runId,
        ...input,
      });
      await audit(deps, authority.homeId, context, "tool_call", {
        name: "prepare_room_action",
        proposalId: proposal.proposalId,
        kind: proposal.kind,
        roomIds: proposal.roomIds,
        stay: [...proposal.stay],
      });
      return proposal;
    },
  });
}
