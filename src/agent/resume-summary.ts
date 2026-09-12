import type { VisitStatus } from "@/core/db/schema";

import { verifiedHostDecisionContext } from "./host-decision-context";

export interface ResumeDecisionSummaryInput {
  approved: boolean;
  note: string | null;
  reason: unknown;
}

export type ResumeVisitStatus = VisitStatus | null;

interface ResumeSummaryInput {
  locale: "en" | "es";
  decisions: readonly ResumeDecisionSummaryInput[];
  visitStatus: ResumeVisitStatus;
}

/**
 * Builds the public result for a resumed run from trusted application state.
 * A model-generated final message is not an authority for whether review
 * happened or which request the host reviewed.
 */
export function resumedRunSummary({
  locale,
  decisions,
  visitStatus,
}: ResumeSummaryInput): string {
  const approved = decisions.length > 0 && decisions.every((item) => item.approved);
  const contexts = decisions
    .map((item) => verifiedHostDecisionContext(item.reason))
    .filter((item) => item !== null);
  const specialRequests = unique(
    contexts.flatMap((context) => [...context.specialRequests]),
  );
  const overflowArrangements = unique(
    contexts.flatMap((context) => [...(context.overflowArrangements ?? [])]),
  );
  const notes = unique(
    decisions.map((item) => item.note?.trim() ?? "").filter(Boolean),
  );

  return locale === "es"
    ? spanishSummary({
        approved,
        visitStatus,
        specialRequests,
        overflowArrangements,
        notes,
      })
    : englishSummary({
        approved,
        visitStatus,
        specialRequests,
        overflowArrangements,
        notes,
      });
}

interface SummaryFacts {
  approved: boolean;
  visitStatus: ResumeVisitStatus;
  specialRequests: string[];
  overflowArrangements: string[];
  notes: string[];
}

function englishSummary(facts: SummaryFacts): string {
  const rows = [
    ["Host review", facts.approved ? "Approved" : "Declined"],
    [
      "Policy evaluation",
      facts.approved
        ? "Host approval applied after review"
        : "Host declined the request",
    ],
    ...(facts.specialRequests.length > 0
      ? [["Special request", facts.specialRequests.join("; ")]]
      : []),
    ...(facts.overflowArrangements.length > 0
      ? [["Sleeping arrangement", facts.overflowArrangements.join("; ")]]
      : []),
    ...(facts.notes.length > 0
      ? [["Host note", facts.notes.join("; ")]]
      : []),
    ["Visit", englishVisitResult(facts.visitStatus)],
  ];
  const lead = facts.approved
    ? "The host approved the request. The booking workflow has finished."
    : "The host declined the request. The booking workflow has finished.";
  return `${lead}\n\n### What was done\n\n${markdownTable(rows, ["Step", "Result"])}`;
}

function spanishSummary(facts: SummaryFacts): string {
  const rows = [
    ["Revisión del anfitrión", facts.approved ? "Aprobada" : "Rechazada"],
    [
      "Evaluación de la política",
      facts.approved
        ? "La aprobación del anfitrión se aplicó después de la revisión"
        : "El anfitrión rechazó la solicitud",
    ],
    ...(facts.specialRequests.length > 0
      ? [["Solicitud especial", facts.specialRequests.join("; ")]]
      : []),
    ...(facts.overflowArrangements.length > 0
      ? [["Distribución para dormir", facts.overflowArrangements.join("; ")]]
      : []),
    ...(facts.notes.length > 0
      ? [["Nota del anfitrión", facts.notes.join("; ")]]
      : []),
    ["Visita", spanishVisitResult(facts.visitStatus)],
  ];
  const lead = facts.approved
    ? "El anfitrión aprobó la solicitud. El proceso de reserva ha terminado."
    : "El anfitrión rechazó la solicitud. El proceso de reserva ha terminado.";
  return `${lead}\n\n### Qué se hizo\n\n${markdownTable(rows, ["Paso", "Resultado"])}`;
}

function englishVisitResult(status: ResumeVisitStatus): string {
  if (
    status === "confirmed" ||
    status === "reconfirm_pending" ||
    status === "reconfirmed" ||
    status === "escalated"
  ) {
    return "Confirmed";
  }
  if (status === "hold") return "Held pending confirmation";
  if (status === "cancelled") return "Cancelled";
  return "Not confirmed";
}

function spanishVisitResult(status: ResumeVisitStatus): string {
  if (
    status === "confirmed" ||
    status === "reconfirm_pending" ||
    status === "reconfirmed" ||
    status === "escalated"
  ) {
    return "Confirmada";
  }
  if (status === "hold") return "Retenida, pendiente de confirmación";
  if (status === "cancelled") return "Cancelada";
  return "No confirmada";
}

function markdownTable(rows: string[][], headers: [string, string]): string {
  return [
    `| ${headers[0]} | ${headers[1]} |`,
    "| --- | --- |",
    ...rows.map(
      ([step, result]) => `| ${tableCell(step)} | ${tableCell(result)} |`,
    ),
  ].join("\n");
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function tableCell(value = ""): string {
  return value
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\|/g, "/")
    .replace(/[*`]/g, "")
    .trim();
}
