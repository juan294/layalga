import { randomUUID, randomBytes } from "node:crypto";

import { deriveCaptureLink, hashLinkToken } from "./link-tokens";
export { hashLinkToken } from "./link-tokens";

import type postgres from "postgres";
import type { TransactionSql } from "postgres";

import { sqlClient, type DatabaseClient } from "../db/client";

export class CaptureInputError extends Error {
  constructor(readonly reason: "name" | "party" | "changed" | "scrubbed") {
    super(`Capture unavailable: ${reason}`);
  }
}

export interface LinkToken {
  token: string;
  hash: string;
}

export interface CaptureInvitationInput {
  homeId: string;
  hostId: string;
  returningPartyId?: string;
  partyName: string;
  partyLocale: "en" | "es";
  rawMessage: string;
  structured?: postgres.JSONValue;
  linkTokenExpiresAt?: Date | null;
  tokenSecret?: string;
  appUrl?: string;
  now?: Date;
}

export interface CapturedInvitation {
  invitationId: string;
  partyId: string;
  guestLink: string;
}

export interface InvitationByToken {
  id: string;
  homeId: string;
  hostId: string;
  partyId: string;
  partyName: string;
  partyLocale: "en" | "es";
  rawMessage: string;
  structured: unknown;
  status: "tentative" | "sent" | "converted" | "cancelled";
  linkTokenExpiresAt: Date | null;
}

interface InvitationRow {
  id: string;
  home_id: string;
  host_id: string;
  party_id: string;
  family_name: string;
  locale: "en" | "es";
  raw_message: string;
  structured: unknown;
  status: InvitationByToken["status"];
  link_token_expires_at: Date | null;
}

export interface ReissueInvitationLinkOptions {
  tokenSecret?: string;
  appUrl?: string;
  now?: Date;
}

const LINK_LIFETIME_MS = 30 * 24 * 60 * 60 * 1_000;

/** Called inside the authorized booking transaction; never un-revokes a link. */
export async function extendInvitationAccessForStay(
  transaction: TransactionSql,
  invitationId: string,
  stayEnd: string,
): Promise<void> {
  await transaction`
    update public.invitations
    set link_token_expires_at = greatest(
      link_token_expires_at,
      ((${stayEnd}::date + 7)::timestamp at time zone 'UTC')
    )
    where id = ${invitationId}
      and link_token is not null
      and status <> 'cancelled'
      and link_token_revoked_at is null
  `;
}

export function issueLinkToken(
  secret: string = requiredSetting("LINK_TOKEN_SECRET"),
): LinkToken {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashLinkToken(token, secret) };
}

export async function captureInvitation(
  database: DatabaseClient,
  input: CaptureInvitationInput,
): Promise<CapturedInvitation> {
  return sqlClient(database).begin((tx) => insertCapture(tx, input));
}

export interface CaptureLease {
  runId: string;
  claimToken: string;
}

export async function captureForRun(
  database: DatabaseClient,
  input: CaptureInvitationInput,
  lease: CaptureLease,
): Promise<Pick<CapturedInvitation, "invitationId" | "partyId">> {
  return sqlClient(database).begin(async (tx) => {
    const [run] = await tx`select r.id from public.runs r join public.hosts h
      on h.id = ${input.hostId} and h.home_id = r.home_id
      where r.id = ${lease.runId} and r.home_id = ${input.homeId}
        and r.queue_claim_token = ${lease.claimToken} and r.status = 'running'
        and r.session_id = ${"capture_" + input.hostId}
        and r.payload->>'task' = r.task and r.payload->>'hostId' = ${input.hostId}
        and r.payload->>'homeId' = ${input.homeId} and (
          (r.task = 'host_capture' and ${input.returningPartyId ?? null}::uuid is null) or
          (r.task = 'host_capture_v2' and (
            (r.payload#>>'{partyChoice,kind}' = 'new' and ${input.returningPartyId ?? null}::uuid is null) or
            (r.payload#>>'{partyChoice,kind}' = 'returning' and
             r.payload#>>'{partyChoice,partyId}' = ${input.returningPartyId ?? null})
          ))) for update of r`;
    if (!run) throw new Error("Capture run authority is unavailable");
    const [previous] = await tx<
      { id: string; party_id: string; host_id: string; home_id: string }[]
    >`
      select id, party_id, host_id, home_id from public.invitations where capture_run_id = ${lease.runId}`;
    if (previous) {
      if (
        previous.host_id !== input.hostId ||
        previous.home_id !== input.homeId ||
        (input.returningPartyId && previous.party_id !== input.returningPartyId)
      )
        throw new Error("Capture association is inconsistent");
      return { invitationId: previous.id, partyId: previous.party_id };
    }
    // A bridge worker may have committed and recorded the invitation before rollout.
    const legacy = await tx<
      { id: string }[]
    >`select distinct payload->>'invitationId' as id
      from public.audit_events where run_id = ${lease.runId} and home_id = ${input.homeId}
      and kind = 'tool_call' and payload->>'name' = 'capture_invitation' limit 2`;
    if (legacy.length) {
      if (legacy.length !== 1) throw new Error("Ambiguous capture association");
      const [bound] = await tx<
        { id: string; party_id: string }[]
      >`update public.invitations set capture_run_id = ${lease.runId}
        where id::text = ${legacy[0]!.id} and home_id = ${input.homeId} and host_id = ${input.hostId}
        and capture_run_id is null and link_scheme is null and (${input.returningPartyId ?? null}::uuid is null or party_id = ${input.returningPartyId ?? null})
        returning id, party_id`;
      if (!bound) throw new Error("Capture association is unavailable");
      return { invitationId: bound.id, partyId: bound.party_id };
    }
    const { invitationId, partyId } = await insertCapture(
      tx,
      input,
      lease.runId,
    );
    return { invitationId, partyId };
  });
}

export async function insertCapture(
  transaction: TransactionSql,
  input: CaptureInvitationInput,
  runId?: string,
): Promise<CapturedInvitation> {
  const secret = input.tokenSecret ?? requiredSetting("LINK_TOKEN_SECRET");
  const appUrl = (input.appUrl ?? requiredSetting("APP_URL")).replace(
    /\/$/,
    "",
  );
  const id = randomUUID();
  const generation = runId ? randomUUID() : null;
  const link = generation
    ? deriveCaptureLink(secret, id, generation)
    : issueLinkToken(secret);
  const structured = input.structured ?? {};
  const expiresAt =
    input.linkTokenExpiresAt ??
    new Date((input.now ?? new Date()).getTime() + LINK_LIFETIME_MS);
  const [host] = await transaction<{ id: string }[]>`
      select id from public.hosts
      where id = ${input.hostId} and home_id = ${input.homeId}
    `;
  if (!host) throw new Error("Host does not belong to the invitation home");

  let partyId: string;
  let locale = input.partyLocale;
  if (input.returningPartyId) {
    const [party] = await transaction<{ id: string; locale: "en" | "es" }[]>`
        select id, locale from public.parties
        where id = ${input.returningPartyId} and home_id = ${input.homeId}
        for update
      `;
    if (!party) throw new CaptureInputError("party");
    partyId = party.id;
    locale = party.locale;
  } else {
    const [created] = await transaction<{ id: string }[]>`
        insert into public.parties (home_id, family_name, locale)
        values (${input.homeId}, ${input.partyName}, ${input.partyLocale})
        on conflict do nothing returning id
      `;
    if (!created) throw new CaptureInputError("name");
    partyId = created.id;
  }

  const invitations = await transaction<{ id: string }[]>`
      insert into public.invitations (
        home_id,
        host_id,
        party_id,
        raw_message,
        structured,
        status,
        link_token,
        link_token_expires_at, id, capture_run_id, link_scheme, link_generation, link_locale
      )
      values (
        ${input.homeId},
        ${input.hostId},
        ${partyId},
        ${input.rawMessage},
        ${JSON.stringify(structured)}::text::jsonb,
        'tentative',
        ${link.hash},
        ${expiresAt.toISOString()}, ${id}, ${runId ?? null}, ${generation ? 1 : null}, ${generation}, ${generation ? locale : null}
      )
      returning id
    `;
  const invitationId = invitations[0]?.id;
  if (!invitationId) throw new Error("Failed to create the invitation");

  return {
    invitationId,
    partyId,
    guestLink: `${appUrl}/${locale}/g/${link.token}`,
  };
}

export async function reissueInvitationLink(
  database: DatabaseClient,
  invitationId: string,
  options: ReissueInvitationLinkOptions = {},
): Promise<string> {
  const client = sqlClient(database);
  const secret = options.tokenSecret ?? requiredSetting("LINK_TOKEN_SECRET");
  const appUrl = (options.appUrl ?? requiredSetting("APP_URL")).replace(
    /\/$/,
    "",
  );
  const now = options.now ?? new Date();
  const expiresAt = new Date(now.getTime() + LINK_LIFETIME_MS);

  return client.begin(async (transaction) => {
    const [invitation] = await transaction<
      {
        party_id: string;
        locale: "en" | "es";
        link_scheme: number | null;
        link_locale: string | null;
      }[]
    >`
      select i.party_id, p.locale, i.link_scheme, i.link_locale
      from public.invitations i
      join public.parties p on p.id = i.party_id and p.home_id = i.home_id
      where i.id = ${invitationId} and i.status <> 'cancelled'
      for update of i
    `;
    if (!invitation) throw new Error(`Invitation not found: ${invitationId}`);

    const generation = invitation.link_scheme === 1 ? randomUUID() : null;
    const link = generation
      ? deriveCaptureLink(secret, invitationId, generation)
      : issueLinkToken(secret);
    await transaction`
      update public.invitations
      set link_generation = ${generation}, link_token = ${link.hash},
          link_token_expires_at = greatest(
            ${expiresAt.toISOString()}::timestamptz,
            (
              select (max(upper(visit.stay)) + 7)::timestamp at time zone 'UTC'
              from public.visits visit
              where visit.invitation_id = ${invitationId}
                and visit.status in ('confirmed', 'reconfirm_pending', 'reconfirmed', 'escalated')
                and not upper_inf(visit.stay)
                and isfinite(upper(visit.stay))
            )
          ),
          link_token_revoked_at = null
      where id = ${invitationId}
    `;
    return `${appUrl}/${invitation.link_locale ?? invitation.locale}/g/${link.token}`;
  });
}

export async function findInvitationByToken(
  database: DatabaseClient,
  token: string,
  secret: string = requiredSetting("LINK_TOKEN_SECRET"),
): Promise<InvitationByToken | null> {
  const client = sqlClient(database);
  const tokenHash = hashLinkToken(token, secret);
  const rows = await client<InvitationRow[]>`
    select
      i.id,
      i.home_id,
      i.host_id,
      i.party_id,
      p.family_name,
      p.locale,
      i.raw_message,
      i.structured,
      i.status,
      i.link_token_expires_at
    from public.invitations i
    join public.parties p on p.id = i.party_id
    where i.link_token = ${tokenHash}
      and i.status <> 'cancelled'
      and i.link_token_revoked_at is null
      and i.link_token_expires_at > now()
    limit 1
  `;
  const row = rows[0];
  return row ? invitationFromRow(row) : null;
}

export async function findInvitationById(
  database: DatabaseClient,
  invitationId: string,
): Promise<InvitationByToken | null> {
  const client = sqlClient(database);
  const rows = await client<InvitationRow[]>`
    select
      i.id,
      i.home_id,
      i.host_id,
      i.party_id,
      p.family_name,
      p.locale,
      i.raw_message,
      i.structured,
      i.status,
      i.link_token_expires_at
    from public.invitations i
    join public.parties p on p.id = i.party_id
    where i.id = ${invitationId}
      and i.status <> 'cancelled'
    limit 1
  `;
  const row = rows[0];
  return row ? invitationFromRow(row) : null;
}

function invitationFromRow(row: InvitationRow): InvitationByToken {
  return {
    id: row.id,
    homeId: row.home_id,
    hostId: row.host_id,
    partyId: row.party_id,
    partyName: row.family_name,
    partyLocale: row.locale,
    rawMessage: row.raw_message,
    structured: row.structured,
    status: row.status,
    linkTokenExpiresAt: row.link_token_expires_at,
  };
}

function requiredSetting(name: "APP_URL" | "LINK_TOKEN_SECRET"): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
