import { tool } from "@strands-agents/sdk";
import { z } from "zod";

import { listGuestRoomOptions } from "@/core/rooms/availability";
import { MAX_GUEST_ROOM_INVENTORY } from "@/core/rooms/limits";
import { recommendRoomsWithOverflow } from "@/core/rooms/recommendation";

import type { AgentDeps } from "../ports";
import { staySchema } from "../schemas";
import { audit, requireAuthority } from "./shared";
import { boundedGuestRoom } from "./room-output";

const MAX_TOOL_ROOMS = MAX_GUEST_ROOM_INVENTORY;

export function findRoomOptionsTool(deps: AgentDeps) {
  return tool({
    name: "find_room_options",
    description:
      "Recommend guest-safe rooms for an exact stay and party size. Overflow recommendations are marked for guest consent and host approval.",
    inputSchema: z.object({
      stay: staySchema,
      partySize: z.int().min(1).max(24),
    }),
    callback: async (input, context) => {
      const { homeId } = requireAuthority(deps);
      const available = await listGuestRoomOptions(
        deps.db,
        homeId,
        input.stay,
        input.partySize,
        { limit: MAX_TOOL_ROOMS + 1 },
      );
      const rooms = available.slice(0, MAX_TOOL_ROOMS);
      const recommendation = recommendRoomsWithOverflow(rooms, input.partySize);
      const recommendedIds = (recommendation?.rooms ?? []).map(({ id }) => id);
      const recommended = rooms.filter(({ id }) => recommendedIds.includes(id));
      await audit(deps, homeId, context, "tool_call", {
        name: "find_room_options",
        optionCount: rooms.length,
        recommendedRoomIds: recommendedIds,
        requiresOverflowApproval: recommendation?.usesOverflow ?? false,
      });
      return {
        rooms: rooms.map(boundedGuestRoom),
        recommended: recommended.map(boundedGuestRoom),
        fits: Boolean(recommendation),
        requiresOverflowApproval: recommendation?.usesOverflow ?? false,
        truncated: available.length > MAX_TOOL_ROOMS,
      };
    },
  });
}
