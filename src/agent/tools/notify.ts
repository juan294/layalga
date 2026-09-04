import { tool } from "@strands-agents/sdk";
import { z } from "zod";

import { sqlClient } from "@/core/db/client";

import type { AgentDeps } from "../ports";
import { audit, requireAuthority } from "./shared";

export function notifyTool(deps: AgentDeps) {
  return tool({
    name: "notify",
    description:
      "Write one bilingual in-app notification for a host or invited party. Always supply complete English and Spanish bodies.",
    inputSchema: z.object({
      recipientKind: z.enum(["host", "party"]),
      recipientId: z.uuid(),
      visitId: z.uuid().optional(),
      scheduledJobId: z.uuid().optional(),
      kind: z.string().min(1),
      bodyEn: z.string().min(1),
      bodyEs: z.string().min(1),
    }),
    callback: async (input, context) => {
      const authority = requireAuthority(deps);
      const isReconfirmation =
        input.kind === "reconfirm_chase" ||
        input.kind === "reconfirm_escalation";
      if (isReconfirmation && (!input.visitId || !input.scheduledJobId)) {
        throw new Error(
          `${input.kind} notifications require visitId and scheduledJobId`,
        );
      }
      assertReconfirmationRecipientKind(input.kind, input.recipientKind);
      assertGuestNotificationChannel(input.kind, input.recipientKind);
      const sql = sqlClient(deps.db);
      if (authority.jobId && input.scheduledJobId !== authority.jobId) {
        throw new Error("Scheduled job is outside the agent task scope");
      }
      if (authority.visitId && input.visitId !== authority.visitId) {
        throw new Error("Visit is outside the agent task scope");
      }
      const [recipient] =
        input.recipientKind === "host"
          ? await sql<{ id: string }[]>`
              select id from public.hosts
              where id = ${input.recipientId} and home_id = ${authority.homeId}
            `
          : await sql<{ id: string }[]>`
              select id from public.parties
              where id = ${input.recipientId} and home_id = ${authority.homeId}
            `;
      if (!recipient)
        throw new Error("Notification recipient is outside the task home");
      if (input.visitId) {
        const [visit] = await sql<{ id: string; party_id: string }[]>`
          select id, party_id from public.visits
          where id = ${input.visitId} and home_id = ${authority.homeId}
        `;
        if (!visit)
          throw new Error("Notification visit is outside the task home");
        assertChaseRecipient(input.kind, input.recipientId, visit.party_id);
      }
      if (input.scheduledJobId) {
        const [job] = await sql<{ id: string }[]>`
          select id from public.scheduled_jobs
          where id = ${input.scheduledJobId}
            and home_id = ${authority.homeId}
            and (${input.visitId ?? null}::uuid is null or visit_id = ${input.visitId ?? null})
        `;
        if (!job) throw new Error("Notification job is outside the task home");
      }
      const [inserted] = await sql<{ id: string }[]>`
        insert into public.notifications (
          home_id, recipient_kind, recipient_id, visit_id, scheduled_job_id,
          kind, body_en, body_es
        ) values (
          ${authority.homeId}, ${input.recipientKind}, ${input.recipientId},
          ${input.visitId ?? null}, ${input.scheduledJobId ?? null},
          ${input.kind}, ${input.bodyEn}, ${input.bodyEs}
        )
        on conflict do nothing
        returning id
      `;
      const row =
        inserted ??
        (isReconfirmation
          ? (
              await sql<{ id: string }[]>`
                select id from public.notifications
                where scheduled_job_id = ${input.scheduledJobId!}
                  and recipient_kind = ${input.recipientKind}
                  and recipient_id = ${input.recipientId}
                  and kind = ${input.kind}
                limit 1
              `
            )[0]
          : undefined);
      if (!row) throw new Error("Failed to write notification");
      await audit(deps, authority.homeId, context, "tool_call", {
        name: "notify",
        notificationId: row.id,
      });
      return { notificationId: row.id };
    },
  });
}

export function assertReconfirmationRecipientKind(
  kind: string,
  recipientKind: "host" | "party",
): void {
  if (
    (kind === "reconfirm_chase" && recipientKind !== "party") ||
    (kind === "reconfirm_escalation" && recipientKind !== "host")
  ) {
    throw new Error("Notification recipient kind does not match the job");
  }
}

/**
 * Deterministic enforcement of "guests get outcomes through their private
 * link, never an in-app notification" (D5-adjacent; see
 * `NO_NOTIFY_INSTRUCTION` in `src/agent/run-task.ts`, the prompt-level
 * steer this backs up). `reconfirm_chase` is the one product path that
 * messages a family in-app -- the reconfirmation reminder before arrival --
 * so it is the only `kind` a `party` recipient is allowed for. Every other
 * `kind` must target a `host`.
 */
export function assertGuestNotificationChannel(
  kind: string,
  recipientKind: "host" | "party",
): void {
  if (recipientKind === "party" && kind !== "reconfirm_chase") {
    throw new Error(
      "Guests receive outcomes through their private link; notify only hosts here",
    );
  }
}

export function assertChaseRecipient(
  kind: string,
  recipientId: string,
  visitPartyId: string,
): void {
  if (kind === "reconfirm_chase" && recipientId !== visitPartyId) {
    throw new Error("Chase recipient is not the visit party");
  }
}
