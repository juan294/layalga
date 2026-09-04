import { z } from "zod";

import {
  MAX_ADULTS,
  MAX_ARRIVAL_TIME_LENGTH,
  MAX_CHILDREN,
  MAX_GUEST_NOTES_LENGTH,
  MAX_PETS,
} from "@/agent/task-limits";
import { MAX_ROOM_SELECTION } from "@/core/rooms/limits";

import { optionWindowIsAllowed } from "./option-window";

export const guestSessionOptionInput = z
  .object({
    locale: z.enum(["en", "es"]),
    from: z.iso.date(),
    to: z.iso.date(),
    nights: z.coerce.number().int().min(1).max(30),
    adults: z.coerce.number().int().min(1).max(MAX_ADULTS),
    children: z.coerce.number().int().min(0).max(MAX_CHILDREN),
    pets: z.coerce.number().int().min(0).max(MAX_PETS),
  })
  .refine(({ from, to }) => optionWindowIsAllowed(from, to), {
    message: "Date window exceeds the maximum",
    path: ["to"],
  });

export const guestTokenOptionInput = guestSessionOptionInput.safeExtend({
  token: z.string().min(1),
});

export const guestSessionSubmitInput = z.object({
  locale: z.enum(["en", "es"]),
  stay: z.string().regex(/^\d{4}-\d{2}-\d{2}\|\d{4}-\d{2}-\d{2}$/),
  adults: z.coerce.number().int().min(1).max(MAX_ADULTS),
  children: z.coerce.number().int().min(0).max(MAX_CHILDREN),
  pets: z.coerce.number().int().min(0).max(MAX_PETS),
  roomIds: z.array(z.uuid()).min(1).max(MAX_ROOM_SELECTION),
  overflowConsent: z.boolean(),
  arrivalTime: z.string().max(MAX_ARRIVAL_TIME_LENGTH).optional(),
  notes: z.string().max(MAX_GUEST_NOTES_LENGTH).optional(),
});

export const guestTokenSubmitInput = guestSessionSubmitInput.safeExtend({
  token: z.string().min(1),
});

export function guestSubmitFormValue(formData: FormData) {
  return {
    ...Object.fromEntries(formData),
    roomIds: formData.getAll("roomIds").map(String),
    overflowConsent: formData.get("overflowConsent") === "on",
  };
}
