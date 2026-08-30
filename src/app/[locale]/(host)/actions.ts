"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { getAgentClient } from "@/agent/client";
import {
  MAX_DECISION_NOTE_LENGTH,
  MAX_HOST_MESSAGE_LENGTH,
} from "@/agent/task-limits";
import { reissueInvitationLink } from "@/core/booking/invitations";
import { sqlClient } from "@/core/db/client";
import { getDatabaseConnection } from "@/core/db/client";
import { requireHost } from "@/lib/auth/current-host";
import { parseServerEnvironment } from "@/lib/server/env";
import {
  reportActionError,
  reportedActionError,
} from "@/lib/server/action-errors";

export type CaptureState =
  | { status: "idle" }
  | { status: "queued"; runId: string }
  | { status: "error"; error: "empty" | "failed" };

export type CaptureResultState =
  | { status: "idle" }
  | {
      status: "success";
      guestLink: string;
      structured: unknown;
    }
  | { status: "error" };

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
    };
  } catch (error) {
    reportActionError("host_capture_failed", error);
    return { status: "error", error: "failed" };
  }
}

export async function revealCapturedInvitationAction(
  _previous: CaptureResultState,
  formData: FormData,
): Promise<CaptureResultState> {
  const locale = localeValue(formData);
  const host = await requireHost(locale);
  const parsedRunId = z.uuid().safeParse(formData.get("runId"));
  if (!parsedRunId.success) return { status: "error" };

  try {
    const connection = getDatabaseConnection();
    const sql = sqlClient(connection.db);
    const [capture] = await sql<
      { invitation_id: string; structured: unknown }[]
    >`
      select i.id as invitation_id, i.structured
      from public.runs r
      join public.audit_events ae
        on ae.run_id = r.id
       and ae.home_id = r.home_id
       and ae.kind = 'tool_call'
       and ae.payload->>'name' = 'capture_invitation'
      join public.invitations i
        on i.id::text = ae.payload->>'invitationId'
       and i.home_id = r.home_id
       and i.host_id = ${host.id}
      where r.id = ${parsedRunId.data}
        and r.home_id = ${host.homeId}
        and r.task = 'host_capture'
        and r.status = 'completed'
        and r.payload->>'task' = 'host_capture'
        and r.payload->>'hostId' = ${host.id}
        and r.session_id = ${`capture_${host.id}`}
      order by ae.created_at desc
      limit 1
    `;
    if (!capture) return { status: "error" };

    const guestLink = await reissueInvitationLink(
      connection.db,
      capture.invitation_id,
      { appUrl: parseServerEnvironment().appUrl },
    );
    return {
      status: "success",
      guestLink,
      structured: capture.structured,
    };
  } catch (error) {
    reportActionError("host_capture_failed", error);
    return { status: "error" };
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
  let runId: string | null = null;

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

    const run = await getAgentClient().enqueue({
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
    runId = run.runId;
  } catch (error) {
    throw reportedActionError("host_decision_failed", error);
  }
  if (runId) {
    redirect(
      `/${locale}/runs/${runId}/status?returnTo=${encodeURIComponent(`/${locale}`)}`,
    );
  }
}

function localeValue(formData: FormData): "en" | "es" {
  return formData.get("locale") === "es" ? "es" : "en";
}
