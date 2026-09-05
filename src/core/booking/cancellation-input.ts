import { z } from "zod";

const schema = z
  .object({
    confirmed: z.literal("yes"),
    expectedVisitId: z.union([z.uuid(), z.literal("")]),
    expectedStay: z.union([
      z.string().regex(/^\d{4}-\d{2}-\d{2}\|\d{4}-\d{2}-\d{2}$/),
      z.literal(""),
    ]),
  })
  .refine(
    (input) => Boolean(input.expectedVisitId) === Boolean(input.expectedStay),
  );

export function cancellationReviewInput(formData: FormData) {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    throw new Error("Review and confirm the cancellation first");
  return {
    expectedVisitId: parsed.data.expectedVisitId || null,
    expectedStay: parsed.data.expectedStay
      ? (parsed.data.expectedStay.split("|") as [string, string])
      : null,
  };
}
