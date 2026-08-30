import { getDatabaseConnection, sqlClient } from "@/core/db/client";
import { findInvitationByToken } from "@/core/booking/invitations";
import { getCurrentHost } from "@/lib/auth/current-host";

export type RunStatus = "running" | "completed" | "interrupted" | "failed";

export interface RunSnapshot {
  id: string;
  status: RunStatus;
  summary: string | null;
  finishedAt: string | null;
}

export async function getAuthorizedRunSnapshot(
  id: string,
  token?: string,
): Promise<RunSnapshot | null> {
  const sql = sqlClient(getDatabaseConnection().db);
  const [run] = await sql<
    {
      id: string;
      home_id: string;
      session_id: string;
      status: RunStatus;
      result: unknown;
      finished_at: Date | string | null;
    }[]
  >`
    select id, home_id, session_id, status, result, finished_at
    from public.runs
    where id = ${id}
    limit 1
  `;
  if (!run) return null;

  let authorized = false;
  if (token) {
    const invitation = await findInvitationByToken(
      getDatabaseConnection().db,
      token,
    );
    if (
      invitation &&
      invitation.homeId === run.home_id &&
      run.session_id === `inv_${invitation.id}`
    ) {
      authorized = true;
    }
  }

  if (!authorized) {
    const host = await getCurrentHost();
    authorized = host?.homeId === run.home_id;
  }
  if (!authorized) return null;

  return {
    id: run.id,
    status: run.status,
    summary: summaryFrom(run.result),
    finishedAt: run.finished_at
      ? new Date(run.finished_at).toISOString()
      : null,
  };
}

function summaryFrom(value: unknown): string | null {
  if (typeof value === "string") {
    try {
      return summaryFrom(JSON.parse(value));
    } catch {
      return value;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const summary = (value as Record<string, unknown>).summary;
  return typeof summary === "string" ? summary : null;
}
