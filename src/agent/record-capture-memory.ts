import { sqlClient } from "@/core/db/client";
import { createMemoryClient, type MemoryClient } from "@/core/memory/client";
import { invitationSpecialRequests, objectValue } from "@/lib/json-object";
import { parseServerEnvironment } from "@/lib/server/env";

import type { AgentDeps } from "./ports";

interface CapturedInvitationRow {
  party_id: string;
  structured: unknown;
}

/**
 * After a completed `host_capture`, writes one deterministic `CreateEvent`
 * with the invitation facts — party size, dates text, arrival time, special
 * requests, pets — but never the family name (D7), so household memory is
 * seeded from the very first invitation even when no pre-match existed and
 * the task's `MemoryManager` therefore attached no writable store. A no-op
 * when `MEMORY` is not `agentcore`, or when this run never actually
 * captured an invitation (the model didn't call `capture_invitation`, or
 * the task failed before doing so).
 *
 * `clientToken` is the run id: AgentCore ignores a repeated `CreateEvent`
 * with a token it has already seen, so a retried `host_capture` run never
 * double-writes this event.
 */
export async function recordCaptureMemory(
  deps: AgentDeps,
  runId: string,
  sessionId: string,
  homeId: string,
  client: MemoryClient | undefined = undefined,
): Promise<void> {
  const config = parseServerEnvironment();
  if (config.memory !== "agentcore" || !config.memoryId) return;

  const sql = sqlClient(deps.db);
  const [captured] = await sql<CapturedInvitationRow[]>`
    select invitation.party_id, invitation.structured
    from public.audit_events audit
    join public.invitations invitation
      on invitation.id::text = audit.payload->>'invitationId'
     and invitation.home_id = audit.home_id
    where audit.run_id = ${runId}
      and audit.home_id = ${homeId}
      and audit.kind = 'tool_call'
      and audit.payload->>'name' = 'capture_invitation'
    order by audit.created_at desc
    limit 1
  `;
  if (!captured) return;

  const text = invitationFactsText(captured.structured);
  if (!text) return;

  const resolvedClient =
    client ?? createMemoryClient(config.awsRegion ?? "us-east-1");
  await resolvedClient.createEvent({
    memoryId: config.memoryId,
    actorId: `home-${homeId}/party-${captured.party_id}`,
    sessionId,
    eventTimestamp: deps.clock.now(),
    text,
    clientToken: runId,
  });

  await sql`
    insert into public.audit_events (home_id, run_id, actor, kind, payload)
    values (${homeId}, ${runId}, 'agent', 'memory_written', '{}'::jsonb)
  `;
}

/**
 * Renders the invitation's structured facts as a name-free USER turn.
 * Mirrors the fields `capture_invitation` stores (`src/agent/tools/capture-invitation.ts`):
 * party size, flexible dates text, arrival time, special requests, pets —
 * deliberately never `partyName`.
 */
function invitationFactsText(structured: unknown): string | null {
  const value = objectValue(structured) as {
    adults?: unknown;
    children?: unknown;
    pets?: unknown;
    flexibleDates?: { text?: unknown } | null;
    arrivalTime?: unknown;
  } | null;
  if (!value) return null;

  const adults = typeof value.adults === "number" ? value.adults : 0;
  const children = typeof value.children === "number" ? value.children : 0;
  const pets = typeof value.pets === "number" ? value.pets : 0;
  const datesText =
    typeof value.flexibleDates?.text === "string" &&
    value.flexibleDates.text.trim()
      ? value.flexibleDates.text.trim()
      : "not given";
  const arrivalTime =
    typeof value.arrivalTime === "string" && value.arrivalTime.trim()
      ? value.arrivalTime.trim()
      : "not given";
  const specialRequests = invitationSpecialRequests(structured);

  return (
    `A household invitation was captured. Party size: ${adults} adults, ${children} children, ${pets} pets. ` +
    `Preferred dates: ${datesText}. Arrival time: ${arrivalTime}. ` +
    `Special requests: ${specialRequests.length > 0 ? specialRequests.join("; ") : "none"}.`
  );
}
