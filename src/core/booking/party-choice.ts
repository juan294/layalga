import { z } from "zod";

export const partyChoiceSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("new") }),
  z.strictObject({ kind: z.literal("returning"), partyId: z.uuid() }),
]);
