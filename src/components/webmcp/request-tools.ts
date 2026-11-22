import { z } from "zod";
import type { PublicStayOption } from "@/core/booking/public-stay-search";
import type { StayRange } from "@/core/db/schema";
import { MAX_ROOM_SELECTION } from "@/core/rooms/limits";
import {
  emptySchema,
  preparationAnnotations,
  readAnnotations,
} from "./contract";
import type { WebMcpTool } from "./types";

const selection = z.strictObject({
  from: z.iso.date(),
  to: z.iso.date(),
  roomRefs: z
    .array(z.string().regex(/^[a-f0-9]{64}$/))
    .min(1)
    .max(MAX_ROOM_SELECTION)
    .refine((refs) => new Set(refs).size === refs.length),
});
const invalidSelection = {
  status: "invalid_selection",
  next: "Run the visible availability search again. Choose the check-in, checkout and enough rooms from one displayed option.",
};

export function createPrepareRequestTool(
  options: readonly PublicStayOption[],
  partySize: number,
  reveal: (stay: StayRange, roomRefs: string[]) => boolean,
  hasSession: () => Promise<boolean>,
): WebMcpTool {
  return {
    name: "layalga.public.prepare_stay_request",
    title: "Prepare a visible stay request",
    description:
      "With an active Google session, select rooms in one exact stay on this results page. The guest reviews any overflow arrangement and sends the request using the visible controls.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["from", "to", "roomRefs"],
      properties: {
        from: {
          type: "string",
          format: "date",
          description: "Displayed check-in date",
        },
        to: {
          type: "string",
          format: "date",
          description: "Displayed checkout date",
        },
        roomRefs: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
          maxItems: MAX_ROOM_SELECTION,
          uniqueItems: true,
          description:
            "Room references for this exact option returned by availability search",
        },
      },
    },
    annotations: preparationAnnotations,
    async execute(raw) {
      try {
        if (!(await hasSession()))
          return {
            status: "sign_in",
            next: "Reopen this booking page, choose Continue with Google, and run the availability search again.",
          };
      } catch {
        return {
          status: "unavailable",
          next: "Refresh this booking page and retry.",
        };
      }
      const parsed = selection.safeParse(raw);
      if (!parsed.success) return invalidSelection;
      const { from, to, roomRefs } = parsed.data;
      const option = options.find(
        (item) => item.stay[0] === from && item.stay[1] === to,
      );
      if (!option) return invalidSelection;
      const rooms = option.rooms.filter((room) => roomRefs.includes(room.ref));
      if (
        rooms.length !== roomRefs.length ||
        rooms.reduce((sum, room) => sum + room.maximumCapacity, 0) < partySize
      )
        return invalidSelection;
      if (!reveal(option.stay, roomRefs)) return invalidSelection;
      const requiresOverflowConsent =
        rooms.reduce((sum, room) => sum + room.standardCapacity, 0) < partySize;
      return {
        status: "prepared",
        requiresOverflowConsent,
        next: requiresOverflowConsent
          ? "Ask the guest to review the sleeping arrangement, explicitly accept it on the form, then review and send the request."
          : "Ask the guest to review the selected rooms and send the request using the visible controls.",
      };
    },
  };
}

export function createReceiptStatusTool(
  read: () => Promise<unknown>,
): WebMcpTool {
  return {
    name: "layalga.guest.read_request_status",
    title: "Read this stay request’s current status",
    description:
      "Read the currently displayed request as its signed-in guest. For confirmed requests, visitStatus is the live visit outcome. For sign_in, sign in and reopen this receipt. For not_found, choose a request in your own request history. For unavailable, retry the receipt later.",
    inputSchema: emptySchema(),
    annotations: readAnnotations,
    async execute(input) {
      if (
        !input ||
        typeof input !== "object" ||
        Array.isArray(input) ||
        Object.keys(input).length
      )
        return {
          status: "invalid",
          next: "Call without arguments on your own open receipt.",
        };
      try {
        return await read();
      } catch {
        return {
          status: "unavailable",
          next: "Refresh the private receipt and retry.",
        };
      }
    },
  };
}
