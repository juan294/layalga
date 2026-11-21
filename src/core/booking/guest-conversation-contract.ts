import { z } from "zod";
import { MAX_ADULTS, MAX_CHILDREN, MAX_PETS } from "@/agent/task-limits";
import type {
  StayRange,
  StayRequestStatus,
  VisitStatus,
} from "@/core/db/schema";
import type { PublicStayOption } from "./public-stay-search";
import type { GuestSearchCriteria } from "./stay-options";

// Every turn carries only editable public criteria. There is no chat transcript.
export const conversationFields = z.strictObject({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  month: z.number().int().min(1).max(12).optional(),
  year: z.number().int().min(2000).max(2200).optional(),
  relative: z
    .enum([
      "next_month",
      "this_month",
      "next_week",
      "this_week",
      "tomorrow",
      "today",
    ])
    .optional(),
  nights: z.number().int().min(1).max(30).optional(),
  adults: z.number().int().min(1).max(MAX_ADULTS).optional(),
  children: z.number().int().min(0).max(MAX_CHILDREN).optional(),
  pets: z.number().int().min(0).max(MAX_PETS).optional(),
});
export const conversationState = conversationFields.extend({
  arrivalDay: z.number().int().min(1).max(31).optional(),
  departureDay: z.number().int().min(1).max(31).optional(),
  handle: z.uuid().optional(),
  name: z.string().trim().min(2).max(80).optional(),
  avoidRoomPreference: z.boolean().optional(),
  roomPreference: z.string().trim().min(1).max(80).optional(),
});
export const conversationInput = z.strictObject({
  locale: z.enum(["en", "es"]),
  message: z.string().trim().max(600),
  state: conversationState.optional(),
});
export type GuestConversationState = z.infer<typeof conversationState>;
export type GuestConversationReceipt = {
  id: string;
  status: StayRequestStatus;
  visitStatus: VisitStatus | null;
  displayName?: string;
  stay?: StayRange;
};
export interface GuestConversationReply {
  kind:
    | "clarify"
    | "listings"
    | "options"
    | "none"
    | "status"
    | "sign_in"
    | "privacy"
    | "unavailable"
    | "review"
    | "submit";
  state: GuestConversationState;
  message: string;
  listings?: { handle: string; displayName: string }[];
  criteria?: GuestSearchCriteria;
  options?: PublicStayOption[];
  selectedIndex?: number;
  receipts?: GuestConversationReceipt[];
}
