import { tool } from "@strands-agents/sdk";
import { z } from "zod";

import { listGuestRoomOptions } from "@/core/rooms/availability";
import { MAX_GUEST_ROOM_INVENTORY } from "@/core/rooms/limits";
import { recommendRoomsWithOverflow } from "@/core/rooms/recommendation";
import { loadPartyRoomPreferences } from "@/core/memory/room-preferences";
import {
  explainRoomPreferences,
  type RoomPreferenceRecall,
} from "@/core/rooms/preferences";

import type { AgentDeps } from "../ports";
import { staySchema } from "../schemas";
import { audit, requireAuthority } from "./shared";
import { boundedGuestRoom } from "./room-output";

const MAX_TOOL_ROOMS = MAX_GUEST_ROOM_INVENTORY;

export function findRoomOptionsTool(deps: AgentDeps) {
  return tool({
    name: "find_room_options",
    description:
      "Recommend guest-safe rooms for an exact stay and party size, using supported preferences from this family's memory when available. Guests choose the rooms. Overflow recommendations require guest consent and host approval.",
    inputSchema: z.object({
      stay: staySchema,
      partySize: z.int().min(1).max(24),
    }),
    callback: async (input, context) => {
      const { homeId, partyId } = requireAuthority(deps);
      const available = await listGuestRoomOptions(
        deps.db,
        homeId,
        input.stay,
        input.partySize,
        { limit: MAX_TOOL_ROOMS + 1 },
      );
      const rooms = available.slice(0, MAX_TOOL_ROOMS);
      const preferences: RoomPreferenceRecall = partyId
        ? await loadPartyRoomPreferences(
            deps.db,
            { homeId, partyId },
            { client: deps.memoryClient },
          )
        : { status: "off", preferences: [] };
      const recommendation = recommendRoomsWithOverflow(
        rooms,
        input.partySize,
        preferences.preferences,
      );
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
        preferenceExplanation: explainRoomPreferences(
          preferences,
          recommendation?.rooms ?? [],
        ),
        truncated: available.length > MAX_TOOL_ROOMS,
      };
    },
  });
}
