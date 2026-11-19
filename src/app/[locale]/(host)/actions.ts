"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { retryHostCaptureRun } from "@/agent/run-task";
import { redirect } from "next/navigation";
import { z } from "zod";

import { partyChoiceSchema } from "@/agent/task";
import { getAgentClient } from "@/agent/client";
import {
  MAX_DECISION_NOTE_LENGTH,
  MAX_HOST_MESSAGE_LENGTH,
} from "@/agent/task-limits";
import { CancellationChangedError } from "@/core/booking/cancellation-error";
import { withdrawInvitation } from "@/core/booking/cancellation";
import { cancellationReviewInput } from "@/core/booking/cancellation-input";
import { configuredScheduler } from "@/agent/scheduler";
import {
  recoverCaptureLink,
  type CaptureLinkResult,
} from "@/core/booking/capture-links";

import { CaptureInputError } from "@/core/booking/invitations";
import { recordHostDecision } from "@/core/decisions/host-decision";
import { sqlClient } from "@/core/db/client";
import { getDatabaseConnection } from "@/core/db/client";
import { forgetPartyMemory } from "@/core/memory/forget";
import { requireHost } from "@/lib/auth/current-host";
import { parseServerEnvironment } from "@/lib/server/env";
import {
  reportActionError,
  reportedActionError,
} from "@/lib/server/action-errors";

export type CaptureState =
  | { status: "idle" }
  | { status: "queued"; runId: string }
  | {
      status: "error";
      error: "empty" | "failed" | "party" | "changed" | "scrubbed";
    };

export type CaptureResultState =
  { status: "idle" } | CaptureLinkResult | { status: "error" };

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

  const captureId = z.uuid().safeParse(formData.get("captureId"));
  if (!captureId.success) return { status: "error", error: "failed" };
  const kind = formData.get("partyKind");
  const choice = partyChoiceSchema.safeParse(
    kind === "returning"
      ? { kind, partyId: formData.get("partyId") }
      : { kind },
  );
  if (!choice.success) return { status: "error", error: "party" };
  try {
    const result = await getAgentClient().enqueue({
      task: "host_capture_v2",
      captureId: captureId.data,
      partyChoice: choice.data,
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
    if (error instanceof CaptureInputError && error.reason !== "name")
      return { status: "error", error: error.reason };
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
    return await recoverCaptureLink(
      connection.db,
      host,
      parsedRunId.data,
      formData.get("confirmReplacement") === "yes",
      parseServerEnvironment().appUrl,
    );
  } catch (error) {
    reportActionError("host_capture_failed", error);
    return { status: "error" };
  }
}

export async function retryCapturedInvitationAction(
  formData: FormData,
): Promise<"queued" | "unavailable" | "error"> {
  const host = await requireHost(localeValue(formData));
  const id = z.uuid().safeParse(formData.get("runId"));
  if (!id.success) return "unavailable";
  try {
    const task = await retryHostCaptureRun(
      getDatabaseConnection().db,
      host,
      id.data,
    );
    if (!task) return "unavailable";
    after(async () => {
      try {
        await getAgentClient().executeQueued(id.data, task);
      } catch (error) {
        reportActionError("host_capture_failed", error);
      }
    });
    return "queued";
  } catch (error) {
    reportActionError("host_capture_failed", error);
    return "error";
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
  let runId: string | null = null;

  try {
    const decision = await recordHostDecision(getDatabaseConnection().db, {
      decisionId,
      homeId: host.homeId,
      hostId: host.id,
      approved,
      note,
    });
    if (!decision) return;

    const run = await getAgentClient().enqueue({
      task: "resume",
      homeId: host.homeId,
      sessionId: decision.agentSessionId,
      // The deciding host's own locale, so the resumed run's final summary
      // is written in the language of the host reading the run status
      // page, not the guest session's language the resumed conversation
      // continues from (see RESUME_SYSTEM_PROMPT_SUFFIX).
      locale: host.locale,
      responses: [
        {
          interruptId: decision.interruptId,
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

export async function updateEmailPingsAction(
  formData: FormData,
): Promise<void> {
  const locale = localeValue(formData);
  const host = await requireHost(locale);
  const emailPings = formData.get("emailPings") === "true";
  const sql = sqlClient(getDatabaseConnection().db);

  try {
    // host.id comes from the authenticated session, never from form input,
    // so this always writes the caller's own row.
    await sql`
      insert into public.host_notification_settings (host_id, home_id, email_pings)
      values (${host.id}, ${host.homeId}, ${emailPings})
      on conflict (host_id) do update
      set email_pings = excluded.email_pings, updated_at = now()
    `;
    revalidatePath(`/${locale}/settings`);
  } catch (error) {
    reportActionError("email_settings_update_failed", error);
  }
}

export async function forgetPartyMemoryAction(
  formData: FormData,
): Promise<void> {
  const locale = localeValue(formData);
  const host = await requireHost(locale);
  const parsedPartyId = z.uuid().safeParse(formData.get("partyId"));
  if (!parsedPartyId.success) return;
  const config = parseServerEnvironment();
  if (config.memory !== "agentcore" || !config.memoryId || !config.awsRegion) {
    return;
  }

  try {
    const connection = getDatabaseConnection();
    const sql = sqlClient(connection.db);
    // host.id and host.homeId come from the authenticated session; this
    // check keeps the erasure scoped to a party of the caller's own home,
    // never a party of another home from a forged partyId.
    const [party] = await sql<{ id: string }[]>`
      select id from public.parties
      where id = ${parsedPartyId.data} and home_id = ${host.homeId}
    `;
    if (!party) return;

    await forgetPartyMemory(
      connection.db,
      host.homeId,
      parsedPartyId.data,
      config.memoryId,
      config.awsRegion,
    );
    revalidatePath(`/${locale}/guests`);
  } catch (error) {
    reportActionError("memory_forget_failed", error);
  }
}

function localeValue(formData: FormData): "en" | "es" {
  return formData.get("locale") === "es" ? "es" : "en";
}

export async function cancelHostInvitation(formData: FormData): Promise<void> {
  const locale = localeValue(formData);
  const host = await requireHost(locale);
  const invitationId = z.uuid().parse(formData.get("invitationId"));
  const review = cancellationReviewInput(formData);
  try {
    await withdrawInvitation(
      getDatabaseConnection().db,
      {
        homeId: host.homeId,
        invitationId,
        actor: { kind: "host", hostId: host.id },
        ...review,
      },
      configuredScheduler(),
    );
  } catch (error) {
    if (error instanceof CancellationChangedError)
      redirect(
        `/${locale}?cancel=changed&invitation=${invitationId}#cancel-${invitationId}`,
      );
    throw error;
  }

  revalidatePath(`/${locale}`);
}
