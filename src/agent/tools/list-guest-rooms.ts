import { tool } from "@strands-agents/sdk";
import { z } from "zod";

import { listGuestSafeRoomInventory } from "@/core/rooms/availability";
import { MAX_GUEST_ROOM_INVENTORY } from "@/core/rooms/limits";

import type { AgentDeps } from "../ports";
import { audit, requireAuthority } from "./shared";
import { boundedGuestRoom } from "./room-output";

const MAX_TOOL_ROOMS = MAX_GUEST_ROOM_INVENTORY;

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
      return {
        rooms: rooms.map(boundedGuestRoom),
        truncated: available.length > MAX_TOOL_ROOMS,
      };
    },
  });
}
