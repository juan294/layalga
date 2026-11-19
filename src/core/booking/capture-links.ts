import { randomUUID } from "node:crypto";
import { sqlClient, type DatabaseClient } from "../db/client";
import { partyChoiceSchema } from "./party-choice";
import { deriveCaptureLink } from "./link-tokens";

export type CaptureLinkResult =
  | { status: "success"; guestLink: string; structured: unknown }
  | { status: "legacy" }
  | {
      status: "unavailable";
      reason: "expired" | "revoked" | "cancelled" | "unknown";
    };

export async function recoverCaptureLink(
  database: DatabaseClient,
  host: { id: string; homeId: string },
  runId: string,
  confirmReplacement: boolean,
  appUrl: string,
): Promise<CaptureLinkResult> {
  const sql = sqlClient(database);
  const unknown = { status: "unavailable", reason: "unknown" } as const;
  function unresolved(code: string) {
    console.warn("[CAPTURE_LINK_UNAVAILABLE]", { runId, code });
    return unknown;
  }
  return sql.begin(async (tx) => {
    // A scrubbed payload is authoritative only with the durable run FK.
    const [run] = await tx<
      {
        task: string;
        intact: boolean;
        has_choice: boolean;
        choice: unknown;
      }[]
    >`
      select r.task, r.payload <> '{}'::jsonb as intact,
        r.payload ? 'partyChoice' as has_choice, r.payload->'partyChoice' as choice
      from public.runs r join public.hosts h on h.id = ${host.id} and h.home_id = r.home_id
      where r.id = ${runId} and r.home_id = ${host.homeId} and r.status = 'completed'
        and r.task in ('host_capture','host_capture_v2') and r.session_id = ${"capture_" + host.id}
        and (r.payload = '{}'::jsonb or (r.payload->>'task' = r.task and
             r.payload->>'hostId' = ${host.id} and r.payload->>'homeId' = ${host.homeId}))
      for share of r`;
    if (!run) return unknown;
    let returningId: string | null = null;
    if (run.intact && run.task === "host_capture_v2") {
      const parsed = partyChoiceSchema.safeParse(run.choice);
      if (!parsed.success) return unresolved("invalid_choice");
      if (parsed.data.kind === "returning") returningId = parsed.data.partyId;
    } else if (run.has_choice) return unresolved("invalid_choice");
    const [durable] = await tx<{ id: string }[]>`
      select id from public.invitations where capture_run_id = ${runId}`;
    let id = durable?.id;
    if (!id) {
      if (!run.intact) return unresolved("missing_run_evidence");
      const matches = await tx<{ id: string | null }[]>`
        select distinct payload->>'invitationId' as id from public.audit_events
        where home_id = ${host.homeId} and run_id = ${runId} and kind = 'tool_call'
          and payload->>'name' = 'capture_invitation' limit 2`;
      if (matches.length !== 1 || !matches[0]?.id)
        return unresolved(
          matches.length > 1 ? "ambiguous_capture" : "missing_capture",
        );
      id = matches[0].id;
    }
    const [row] = await tx<
      {
        id: string;
        structured: unknown;
        token_hash: string | null;
        expired: boolean;
        revoked: boolean;
        cancelled: boolean;
        link_scheme: number | null;
        link_generation: string | null;
        link_locale: string | null;
        locale: string;
      }[]
    >`
      select i.id, i.structured, i.link_token as token_hash,
        (i.link_token_expires_at > clock_timestamp()) is not true as expired,
        i.link_token_revoked_at is not null as revoked, i.status = 'cancelled' as cancelled,
        i.link_scheme, i.link_generation, i.link_locale, p.locale
      from public.invitations i join public.parties p on p.id = i.party_id and p.home_id = i.home_id
      where i.id::text = ${id} and i.home_id = ${host.homeId} and i.host_id = ${host.id}
        and (i.capture_run_id = ${runId} or (i.capture_run_id is null and i.link_scheme is null))
        and (${returningId}::uuid is null or i.party_id = ${returningId}::uuid)
      for update of i`;
    if (!row) return unresolved("association_mismatch");
    if (row.cancelled)
      return { status: "unavailable", reason: "cancelled" } as const;
    if (row.revoked || !row.token_hash)
      return { status: "unavailable", reason: "revoked" } as const;
    if (row.expired)
      return { status: "unavailable", reason: "expired" } as const;
    const secret = process.env.LINK_TOKEN_SECRET;
    if (!secret) throw new Error("LINK_TOKEN_SECRET is required");
    const legacy = row.link_scheme === null;
    if (legacy && !confirmReplacement) return { status: "legacy" } as const;
    const generation = legacy ? randomUUID() : row.link_generation;
    const locale = legacy ? row.locale : row.link_locale;
    if (!generation || !locale || (!legacy && row.link_scheme !== 1))
      return unknown;
    const link = deriveCaptureLink(secret, row.id, generation);
    if (legacy) {
      const changed =
        await tx`update public.invitations set link_scheme = 1, link_generation = ${generation},
        link_locale = ${locale}, link_token = ${link.hash}, capture_run_id = ${runId}
        where id = ${row.id} and link_scheme is null and link_token_expires_at > clock_timestamp() returning id`;
      if (!changed.length) return unknown;
    } else if (link.hash !== row.token_hash) return unresolved("hash_mismatch");
    return {
      status: "success",
      guestLink: `${appUrl.replace(/\/$/, "")}/${locale}/g/${link.token}`,
      structured: row.structured,
    } as const;
  });
}
