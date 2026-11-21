import { z } from "zod";
import {
  MAX_ADULTS,
  MAX_CHILDREN,
  MAX_GUEST_NOTES_LENGTH,
  MAX_PETS,
  MAX_SPECIAL_REQUEST_LENGTH,
} from "@/agent/task-limits";
import { MAX_ROOM_SELECTION } from "@/core/rooms/limits";

export const stayRequestInput = z.strictObject({
  handle: z.uuid().toLowerCase(),
  criteria: z
    .strictObject({
      from: z.iso.date(),
      to: z.iso.date(),
      nights: z.number().int().min(1).max(30),
      adults: z.number().int().min(1).max(MAX_ADULTS),
      children: z.number().int().min(0).max(MAX_CHILDREN),
      pets: z.number().int().min(0).max(MAX_PETS),
    })
    .refine(
      (c) => Date.parse(c.to) - Date.parse(c.from) === c.nights * 86_400_000,
    ),
  roomRefs: z
    .array(z.string().regex(/^[a-f0-9]{64}$/))
    .min(1)
    .max(MAX_ROOM_SELECTION)
    .refine((refs) => new Set(refs).size === refs.length),
  overflowConsent: z.boolean(),
  notes: z
    .string()
    .trim()
    .max(MAX_GUEST_NOTES_LENGTH)
    .refine((text) => !text.includes("\0")),
  requests: z
    .string()
    .trim()
    .max(MAX_SPECIAL_REQUEST_LENGTH)
    .refine((text) => !text.includes("\0")),
  locale: z.enum(["en", "es"]),
  idempotencyKey: z.uuid().toLowerCase(),
});
export type StayRequestInput = z.infer<typeof stayRequestInput>;
