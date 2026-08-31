import { tool } from "@strands-agents/sdk";
import { z } from "zod";

import { listGuestSafeRoomInventory } from "@/core/rooms/availability";

import type { AgentDeps } from "../ports";
import { audit, requireAuthority } from "./shared";

const MAX_TOOL_ROOMS = 20;

export function listGuestRoomsTool(deps: AgentDeps) {
  return tool({
    name: "list_guest_rooms",
    description:
      "List bounded guest-safe active room inventory, including rooms withheld by default. Results contain no private room notes or calendar capabilities.",
    inputSchema: z.object({}),
    callback: async (_input, context) => {
      const { homeId } = requireAuthority(deps);
      const available = await listGuestSafeRoomInventory(
        deps.db,
        homeId,
        MAX_TOOL_ROOMS + 1,
      );
      const rooms = available.slice(0, MAX_TOOL_ROOMS);
      await audit(deps, homeId, context, "tool_call", {
        name: "list_guest_rooms",
        roomCount: rooms.length,
      });
      return { rooms, truncated: available.length > MAX_TOOL_ROOMS };
    },
  });
}
