import { z } from 'zod';

export const HostDecisionSchema = z.object({
  approved: z.boolean(),
  hostId: z.string().min(1),
  note: z.string().optional(),
});

export const TaskSchema = z.discriminatedUnion('task', [
  z.object({
    task: z.literal('start'),
    sessionId: z.string().min(1),
    prompt: z.string().min(1),
  }),
  z.object({
    task: z.literal('resume'),
    sessionId: z.string().min(1),
    responses: z.array(
      z.object({
        interruptId: z.string().min(1),
        response: HostDecisionSchema,
      }),
    ),
  }),
]);

export type HostDecision = z.infer<typeof HostDecisionSchema>;
export type RuntimeTask = z.infer<typeof TaskSchema>;
