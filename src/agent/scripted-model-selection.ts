import type {
  Message,
  ModelStreamEvent,
  StreamOptions,
  ToolResultContent,
} from "@strands-agents/sdk";

import { sqlClient } from "@/core/db/client";

import type { AgentDeps } from "./deps";
import { ScriptedModel, type ScriptStep } from "./scripted-model";
import type { AgentTask } from "./task";
import { scriptedOutcome } from "./scripted-outcomes";

/** Deterministic local model used only when MODEL=scripted. */
export class TaskScriptedModel extends ScriptedModel {
  constructor(
    private readonly task: AgentTask,
    private readonly deps: AgentDeps,
  ) {
    super([]);
  }

  override async *stream(
    messages: Message[],
    options?: StreamOptions,
  ): AsyncIterable<ModelStreamEvent> {
    const model = new ScriptedModel([await this.nextStep(messages)]);
    yield* model.stream(messages, options);
  }

  private async nextStep(messages: Message[]): Promise<ScriptStep> {
    const result = latestToolResult(messages);
    if (result) {
      if (typeof result.error === "string") {
        return { text: result.error };
      }
      if (typeof result.invitationId === "string") {
        return { text: scriptedOutcome("invitationReady") };
      }
      if (typeof result.visitId === "string") {
        return result.status === "confirmed"
          ? { text: scriptedOutcome("visitConfirmed") }
          : {
              toolUse: {
                name: "confirm_visit",
                input: { visitId: result.visitId },
              },
            };
      }
      if (typeof result.notificationId === "string") {
        return this.tickStep(notificationResultCount(messages));
      }
      return { text: scriptedOutcome("ledgerUpdated") };
    }

    if (this.task.task === "host_capture") {
      const isVega = /vega/i.test(this.task.rawMessage);
      return {
        toolUse: {
          name: "capture_invitation",
          input: {
            partyName: isVega ? "Familia Vega" : "The Oteros",
            partyLocale: this.task.locale,
            adults: 2,
            children: isVega ? 2 : 0,
            pets: isVega ? 0 : 1,
            flexibleDates: { text: this.task.rawMessage },
            specialRequests: isVega
              ? []
              : ["Ground-floor access for a wheelchair user"],
            rawMessage: this.task.rawMessage,
          },
        },
      };
    }

    if (this.task.task === "guest_submit") {
      return {
        toolUse: {
          name: "create_temporary_hold",
          input: {
            invitationId: this.task.invitationId,
            stay: this.task.stay,
            adults: this.task.adults,
            children: this.task.children,
            pets: this.task.pets,
            arrivalTime: this.task.arrivalTime,
            specialRequests: this.task.notes ? [this.task.notes] : [],
          },
        },
      };
    }

    if (this.task.task === "tick") {
      return this.tickStep(0);
    }

    return { text: scriptedOutcome("ledgerUpdated") };
  }

  private async tickStep(notificationCount: number): Promise<ScriptStep> {
    if (this.task.task !== "tick") {
      return { text: scriptedOutcome("ledgerUpdated") };
    }
    const sql = sqlClient(this.deps.db);
    const [job] = await sql<
      {
        kind: "reconfirm_chase" | "reconfirm_escalate";
        visit_id: string;
        party_id: string;
        family_name: string;
      }[]
    >`
      select job.kind, job.visit_id, visit.party_id, party.family_name
      from public.scheduled_jobs as job
      join public.visits as visit on visit.id = job.visit_id
      join public.parties as party on party.id = visit.party_id
      where job.id = ${this.task.jobId}
    `;
    if (!job) return { text: scriptedOutcome("followUpUnavailable") };

    if (job.kind === "reconfirm_chase") {
      if (notificationCount > 0) {
        return { text: scriptedOutcome("guestReconfirmationSent") };
      }
      return notificationStep({
        recipientKind: "party",
        recipientId: job.party_id,
        visitId: job.visit_id,
        scheduledJobId: this.task.jobId,
        kind: "reconfirm_chase",
        bodyEn: `Please confirm whether ${job.family_name} is still coming.`,
        bodyEs: `Confirma si ${job.family_name} todavía va a venir.`,
      });
    }

    const hosts = await sql<{ id: string }[]>`
      select id from public.hosts
      where home_id = ${this.task.homeId}
      order by created_at, id
    `;
    const host = hosts[notificationCount];
    if (!host) {
      return { text: scriptedOutcome("escalationSent") };
    }
    return notificationStep({
      recipientKind: "host",
      recipientId: host.id,
      visitId: job.visit_id,
      scheduledJobId: this.task.jobId,
      kind: "reconfirm_escalation",
      bodyEn: `${job.family_name} has not reconfirmed. Review the visit now.`,
      bodyEs: `${job.family_name} no ha reconfirmado. Revisa la visita ahora.`,
    });
  }
}

export function scriptedModelForTask(
  task: AgentTask,
  deps: AgentDeps,
): TaskScriptedModel {
  return new TaskScriptedModel(task, deps);
}

function notificationStep(input: Record<string, unknown>): ScriptStep {
  return { toolUse: { name: "notify", input } };
}

function notificationResultCount(messages: Message[]): number {
  let count = 0;
  for (const message of messages) {
    for (const block of message.content) {
      if (block.type !== "toolResultBlock") continue;
      if (toolResultRecord(block.content)?.notificationId) count += 1;
    }
  }
  return count;
}

function latestToolResult(messages: Message[]): Record<string, unknown> | null {
  for (
    let messageIndex = messages.length - 1;
    messageIndex >= 0;
    messageIndex -= 1
  ) {
    const message = messages[messageIndex];
    if (!message) continue;
    for (
      let contentIndex = message.content.length - 1;
      contentIndex >= 0;
      contentIndex -= 1
    ) {
      const block = message.content[contentIndex];
      if (block?.type !== "toolResultBlock") continue;
      const result = toolResultRecord(block.content);
      if (result) return result;
    }
  }
  return null;
}

function toolResultRecord(
  contentBlocks: ToolResultContent[],
): Record<string, unknown> | null {
  for (const content of contentBlocks) {
    if (content.type === "jsonBlock" && isRecord(content.json)) {
      return content.json;
    }
    if (content.type === "textBlock") {
      try {
        const parsed: unknown = JSON.parse(content.text);
        if (isRecord(parsed)) return parsed;
        return { error: typeof parsed === "string" ? parsed : content.text };
      } catch {
        return { error: content.text };
      }
    }
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
