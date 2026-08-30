"use server";

import { revalidatePath } from "next/cache";

import { getAgentClient } from "@/agent/client";
import {
  MAX_DECISION_NOTE_LENGTH,
  MAX_HOST_MESSAGE_LENGTH,
} from "@/agent/task-limits";
import { sqlClient } from "@/core/db/client";
import { getDatabaseConnection } from "@/core/db/client";
import { requireHost } from "@/lib/auth/current-host";
import {
  reportActionError,
  reportedActionError,
} from "@/lib/server/action-errors";

export interface CaptureState {
  status: "idle" | "queued" | "success" | "error";
  runId?: string;
  summary?: string;
  guestLink?: string;
  structured?: unknown;
  error?: "empty" | "failed";
}

export async function captureInvitationAction(
  _previous: CaptureState,
  formData: FormData,
): Promise<CaptureState> {
  const locale = localeValue(formData);
  const host = await requireHost(locale);
  const rawMessage = String(formData.get("rawMessage") ?? "").trim();
  if (!rawMessage) return { status: "error", error: "empty" };
  if (rawMessage.length > MAX_HOST_MESSAGE_LENGTH) {
    return { status: "error", error: "failed" };
  }

  try {
    const result = await getAgentClient().enqueue({
      task: "host_capture",
      homeId: host.homeId,
      hostId: host.id,
      rawMessage,
      locale,
    });
    return {
      status: "queued",
      runId: result.runId,
      summary: result.summary,
    };
  } catch (error) {
    reportActionError("host_capture_failed", error);
    return { status: "error", error: "failed" };
  }
}

export async function decideAction(formData: FormData): Promise<void> {
  const locale = localeValue(formData);
  const host = await requireHost(locale);
  const decisionId = String(formData.get("decisionId") ?? "");
  const approved = formData.get("decision") === "approve";
  const noteValue = String(formData.get("note") ?? "").trim();
  if (noteValue.length > MAX_DECISION_NOTE_LENGTH) {
    throw reportedActionError(
      "host_decision_failed",
      new Error("Decision note exceeds the supported length"),
    );
  }
  const note = noteValue || undefined;
  const sql = sqlClient(getDatabaseConnection().db);

  try {
    const [decision] = await sql<
      { agent_session_id: string; interrupt_id: string }[]
    >`
      update public.pending_decisions
      set status = ${approved ? "approved" : "declined"},
        decided_by_host_id = ${host.id},
        decided_at = ${new Date().toISOString()},
        note = ${note ?? null},
        application_error = null
      where id = ${decisionId}
        and home_id = ${host.homeId}
        and (
          status = 'pending'
          or (
            status = ${approved ? "approved" : "declined"}
            and applied_run_id is null
            and decided_by_host_id = ${host.id}
            and note is not distinct from ${note ?? null}
          )
        )
      returning agent_session_id, interrupt_id
    `;
    if (!decision) return;

    await getAgentClient().enqueue({
      task: "resume",
      homeId: host.homeId,
      sessionId: decision.agent_session_id,
      responses: [
        {
          interruptId: decision.interrupt_id,
          response: { approved, hostId: host.id, note },
        },
      ],
    });
    revalidatePath(`/${locale}`);
  } catch (error) {
    throw reportedActionError("host_decision_failed", error);
  }
}

function localeValue(formData: FormData): "en" | "es" {
  return formData.get("locale") === "es" ? "es" : "en";
}
