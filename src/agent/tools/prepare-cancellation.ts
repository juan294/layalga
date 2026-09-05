import { tool } from "@strands-agents/sdk";
import { z } from "zod";
import { sqlClient } from "@/core/db/client";
import type { AgentDeps } from "../ports";
import { audit, homeIdForVisit, requireAuthority } from "./shared";

export function prepareCancellationTool(deps: AgentDeps) {
  return tool({
    name: "prepare_cancellation",
    description:
      "Prepare a cancellation review when a guest cannot attend, wants to withdraw, or asks about cancellation. This never cancels anything. The guest must return to their invitation and explicitly confirm Cancel this visit.",
    inputSchema: z.object({ visitId: z.uuid() }),
    callback: async (input, context) => {
      const authority = requireAuthority(deps);
      if (!authority.visitId)
        throw new Error("A guest visit is required for cancellation review");
      const homeId = await homeIdForVisit(deps, input.visitId);
      const [visit] = await sqlClient(deps.db)<
        { start: string; end: string; status: string }[]
      >`
        select lower(stay)::text as start, upper(stay)::text as end, status
        from public.visits where id = ${input.visitId} and home_id = ${homeId}
      `;
      if (!visit || visit.status === "cancelled")
        throw new Error("This visit is already closed");
      await audit(deps, homeId, context, "tool_call", {
        name: "prepare_cancellation",
        visitId: input.visitId,
      });
      return {
        cancellationRequested: true,
        visit: { id: input.visitId, stay: [visit.start, visit.end] },
        nextStep:
          deps.locale === "es"
            ? "No se ha cambiado nada. Vuelve a tu invitación, abre Cancelar esta visita, revisa las fechas y confirma solo si quieres cancelarla."
            : "Nothing changed. Return to your invitation, open Cancel this visit, review the dates, and confirm only if you wish to cancel.",
      };
    },
  });
}
