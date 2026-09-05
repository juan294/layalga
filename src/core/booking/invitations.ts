import { createHmac, randomBytes } from "node:crypto";

import type { JSONValue, TransactionSql } from "postgres";

import { sqlClient, type DatabaseClient } from "../db/client";

export interface LinkToken {
  token: string;
  hash: string;
}

export interface CaptureInvitationInput {
  homeId: string;
  hostId: string;
  partyName: string;
  partyLocale: "en" | "es";
  rawMessage: string;
  structured?: JSONValue;
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

export function hashLinkToken(token: string, secret: string): string {
  if (!token) throw new Error("Link token is required");
  if (!secret) throw new Error("LINK_TOKEN_SECRET is required");
  return createHmac("sha256", secret).update(token, "utf8").digest("hex");
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
  const client = sqlClient(database);
  const secret = input.tokenSecret ?? requiredSetting("LINK_TOKEN_SECRET");
  const appUrl = (input.appUrl ?? requiredSetting("APP_URL")).replace(
    /\/$/,
    "",
  );
  const link = issueLinkToken(secret);
  const structured = input.structured ?? {};
  const expiresAt =
    input.linkTokenExpiresAt ??
    new Date((input.now ?? new Date()).getTime() + LINK_LIFETIME_MS);

  return client.begin(async (transaction) => {
    const [host] = await transaction<{ id: string }[]>`
      select id from public.hosts
      where id = ${input.hostId} and home_id = ${input.homeId}
    `;
    if (!host) throw new Error("Host does not belong to the invitation home");

    const existingParties = await transaction<{ id: string }[]>`
      select id
      from public.parties
      where home_id = ${input.homeId}
        and family_name = ${input.partyName}
      for update
    `;

    let partyId = existingParties[0]?.id;
    if (partyId) {
      await transaction`
        update public.parties
        set locale = ${input.partyLocale}
        where id = ${partyId}
      `;
    } else {
      const parties = await transaction<{ id: string }[]>`
        insert into public.parties (
          home_id,
          family_name,
          locale
        )
        values (
          ${input.homeId},
          ${input.partyName},
          ${input.partyLocale}
        )
        returning id
      `;
      partyId = parties[0]?.id;
    }

    if (!partyId) throw new Error("Failed to create or load the invited party");

    const invitations = await transaction<{ id: string }[]>`
      insert into public.invitations (
        home_id,
        host_id,
        party_id,
        raw_message,
        structured,
        status,
        link_token,
        link_token_expires_at
      )
      values (
        ${input.homeId},
        ${input.hostId},
        ${partyId},
        ${input.rawMessage},
        ${JSON.stringify(structured)}::text::jsonb,
        'tentative',
        ${link.hash},
        ${expiresAt.toISOString()}
      )
      returning id
    `;
    const invitationId = invitations[0]?.id;
    if (!invitationId) throw new Error("Failed to create the invitation");

    return {
      invitationId,
      partyId,
      guestLink: `${appUrl}/${input.partyLocale}/g/${link.token}`,
    };
  });
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
  const link = issueLinkToken(secret);

  return client.begin(async (transaction) => {
    const [invitation] = await transaction<
      { party_id: string; locale: "en" | "es" }[]
    >`
      select i.party_id, p.locale
      from public.invitations i
      join public.parties p on p.id = i.party_id and p.home_id = i.home_id
      where i.id = ${invitationId} and i.status <> 'cancelled'
      for update of i
    `;
    if (!invitation) throw new Error(`Invitation not found: ${invitationId}`);

    await transaction`
      update public.invitations
      set link_token = ${link.hash},
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
    return `${appUrl}/${invitation.locale}/g/${link.token}`;
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
