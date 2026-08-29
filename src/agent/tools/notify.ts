import { tool } from "@strands-agents/sdk";
import { z } from "zod";

import { sqlClient } from "@/core/db/client";

import type { AgentDeps } from "../deps";
import { audit } from "./shared";

export function notifyTool(deps: AgentDeps) {
  return tool({
    name: "notify",
    description:
      "Write one bilingual in-app notification for a host or invited party. Always supply complete English and Spanish bodies.",
    inputSchema: z.object({
      homeId: z.uuid(),
      recipientKind: z.enum(["host", "party"]),
      recipientId: z.uuid(),
      visitId: z.uuid().optional(),
      kind: z.string().min(1),
      bodyEn: z.string().min(1),
      bodyEs: z.string().min(1),
    }),
    callback: async (input, context) => {
      const sql = sqlClient(deps.db);
      const [row] = await sql<{ id: string }[]>`
        insert into public.notifications (
          home_id, recipient_kind, recipient_id, visit_id, kind, body_en, body_es
        ) values (
          ${input.homeId}, ${input.recipientKind}, ${input.recipientId},
          ${input.visitId ?? null}, ${input.kind}, ${input.bodyEn}, ${input.bodyEs}
        ) returning id
      `;
      if (!row) throw new Error("Failed to write notification");
      await audit(deps, input.homeId, context, "tool_call", {
        name: "notify",
        notificationId: row.id,
      });
      return { notificationId: row.id };
    },
  });
}
