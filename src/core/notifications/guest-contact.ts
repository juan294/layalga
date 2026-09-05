import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Sql, TransactionSql } from "postgres";
import { SystemClock, type Clock } from "../clock";
import { sqlClient, type DatabaseClient } from "../db/client";

const DAY = 86_400_000;
export type GuestSql = Sql | TransactionSql;
export interface GuestContactAuthority {
  homeId: string;
  partyId: string;
  invitationId: string;
}
export interface GuestContactState {
  deliveryFailed?: boolean;
  status: "demo" | "no_contact" | "unverified" | "enabled" | "disabled";
  email: string | null;
}
export class GuestContactError extends Error {
  constructor(readonly code: "invalid" | "unavailable" | "rate_limit") {
    super(code);
    this.name = "GuestContactError";
  }
}
export interface GuestContactRow {
  id: string;
  invitation_id: string;
  home_id: string;
  party_id: string;
  email: string;
  locale: "en" | "es";
  generation: number;
  consent: boolean;
  verified_at: Date | null;
  requested_at: Date;
  rate_window_at: Date;
  rate_count: number;
  link_token: string;
  link_token_expires_at: Date;
  demo: boolean;
}
interface Capability {
  purpose: "verify" | "return";
  contactId: string;
  invitationId: string;
  generation: number;
  fingerprint: string;
  expires: number;
}
const capabilitySchema = z.object({
  purpose: z.enum(["verify", "return"]),
  contactId: z.uuid(),
  invitationId: z.uuid(),
  generation: z.number().int().positive(),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  expires: z.number().int().positive(),
});
const registration = z.object({
  email: z
    .email()
    .max(254)
    .transform((v) => v.trim().toLowerCase()),
  locale: z.enum(["en", "es"]),
  consent: z.literal(true),
  verifiedGoogle: z.boolean().optional(),
});
function tokenSecret(secret?: string) {
  const value = secret ?? process.env.LINK_TOKEN_SECRET;
  if (!value) throw new GuestContactError("unavailable");
  return value;
}
function mac(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("hex");
}
function fingerprint(row: GuestContactRow, secret: string) {
  return mac(`guest-invitation-fingerprint:v1:${row.link_token}`, secret);
}

export function mintGuestCapability(
  row: GuestContactRow,
  purpose: Capability["purpose"],
  now: Date,
  secret?: string,
): string {
  const key = tokenSecret(secret);
  const lifetime = purpose === "verify" ? DAY : 30 * DAY;
  const expires = Math.min(
    now.getTime() + lifetime,
    new Date(row.link_token_expires_at).getTime(),
  );
  const payload: Capability = {
    purpose,
    contactId: row.id,
    invitationId: row.invitation_id,
    generation: row.generation,
    fingerprint: fingerprint(row, key),
    expires,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${mac(`guest-capability:v1:${purpose}:${encoded}`, key)}`;
}
function readCapability(
  raw: string,
  purpose: Capability["purpose"],
  now: Date,
  secret?: string,
): Capability | null {
  if (raw.length > 2048) return null;
  const parts = raw.split(".");
  if (parts.length !== 2 || !/^[a-f0-9]{64}$/.test(parts[1]!)) return null;
  try {
    const parsed = capabilitySchema.safeParse(
      JSON.parse(Buffer.from(parts[0]!, "base64url").toString("utf8")),
    );
    if (
      !parsed.success ||
      parsed.data.purpose !== purpose ||
      parsed.data.expires <= now.getTime()
    )
      return null;
    const expected = mac(
      `guest-capability:v1:${purpose}:${parts[0]}`,
      tokenSecret(secret),
    );
    if (
      !timingSafeEqual(
        Buffer.from(expected, "hex"),
        Buffer.from(parts[1]!, "hex"),
      )
    )
      return null;
    return parsed.data;
  } catch {
    return null;
  }
}
export async function loadLiveGuestContact(
  sql: GuestSql,
  contactId: string,
  now: Date,
): Promise<GuestContactRow | null> {
  const [row] = await sql<GuestContactRow[]>`
    select contact.*,invitation.link_token,invitation.link_token_expires_at,home.demo
    from public.guest_contacts contact
    join public.invitations invitation on invitation.id=contact.invitation_id and invitation.home_id=contact.home_id and invitation.party_id=contact.party_id
    join public.homes home on home.id=contact.home_id
    where contact.id=${contactId} and invitation.status<>'cancelled'
      and invitation.link_token_revoked_at is null and invitation.link_token is not null
      and invitation.link_token_expires_at>${now.toISOString()}
  `;
  return row ?? null;
}
async function contactForCapability(
  sql: GuestSql,
  raw: string,
  purpose: Capability["purpose"],
  now: Date,
  secret?: string,
) {
  const payload = readCapability(raw, purpose, now, secret);
  if (!payload) return null;
  const row = await loadLiveGuestContact(sql, payload.contactId, now);
  if (
    !row ||
    row.demo ||
    !row.consent ||
    row.generation !== payload.generation ||
    row.invitation_id !== payload.invitationId ||
    fingerprint(row, tokenSecret(secret)) !== payload.fingerprint
  )
    return null;
  if (purpose === "return" && !row.verified_at) return null;
  if (purpose === "verify" && row.verified_at) return null;
  return { row, payload };
}
async function assertAuthority(
  sql: GuestSql,
  authority: GuestContactAuthority,
  now: Date,
  lock = false,
) {
  if (lock)
    await sql`select pg_advisory_xact_lock(hashtextextended(${authority.homeId}::text, 0))`;
  const [invitation] = await sql<{ demo: boolean }[]>`
    select home.demo from public.invitations invitation join public.homes home on home.id=invitation.home_id
    where invitation.id=${authority.invitationId} and invitation.home_id=${authority.homeId} and invitation.party_id=${authority.partyId}
      and invitation.status<>'cancelled' and invitation.link_token_revoked_at is null
      and (home.demo or (invitation.link_token is not null and invitation.link_token_expires_at>${now.toISOString()}))
    ${lock ? sql`for update of invitation` : sql``}
  `;
  if (!invitation) throw new GuestContactError("unavailable");
  return invitation;
}
function state(
  row: Pick<GuestContactRow, "email" | "consent" | "verified_at"> | undefined,
): GuestContactState {
  return {
    status: !row
      ? "no_contact"
      : !row.consent
        ? "disabled"
        : row.verified_at
          ? "enabled"
          : "unverified",
    email: row?.email ?? null,
  };
}
export async function loadGuestContact(
  database: DatabaseClient,
  authority: GuestContactAuthority,
  clock: Clock = new SystemClock(),
): Promise<GuestContactState> {
  const sql = sqlClient(database);
  const invitation = await assertAuthority(sql, authority, clock.now());
  if (invitation.demo) return { status: "demo", email: null };
  const [row] = await sql<
    GuestContactRow[]
  >`select * from public.guest_contacts where invitation_id=${authority.invitationId} and home_id=${authority.homeId} and party_id=${authority.partyId}`;
  const [failure] = row
    ? await sql<{ failed: boolean }[]>`
    select status='failed' and error_name<>'UnknownDelivery' as failed
    from public.guest_email_outbox where contact_id=${row.id} and generation=${row.generation}
    order by created_at desc,id desc limit 1
  `
    : [];
  return { ...state(row), deliveryFailed: failure?.failed ?? false };
}
export async function registerGuestContact(
  database: DatabaseClient,
  input: GuestContactAuthority & {
    email: string;
    locale: "en" | "es";
    consent: true;
    verifiedGoogle?: boolean;
  },
  clock: Clock = new SystemClock(),
  secret?: string,
): Promise<GuestContactState> {
  const parsed = registration.safeParse(input);
  if (!parsed.success) throw new GuestContactError("invalid");
  const value = parsed.data,
    now = clock.now();
  return sqlClient(database).begin(async (tx) => {
    const invitation = await assertAuthority(tx, input, now, true);
    if (invitation.demo) return { status: "demo" as const, email: null };
    tokenSecret(secret);
    const [prior] = await tx<
      GuestContactRow[]
    >`select * from public.guest_contacts where invitation_id=${input.invitationId} for update`;
    // Reset only after 24 hours without enrollment, preventing a burst of
    // additional sends across a fixed window boundary.
    const sameWindow =
      prior && now.getTime() - new Date(prior.rate_window_at).getTime() < DAY;
    if (sameWindow && prior.rate_count >= 3)
      throw new GuestContactError("rate_limit");
    const [contact] = await tx<GuestContactRow[]>`
      insert into public.guest_contacts(invitation_id,home_id,party_id,email,locale,consent,verified_at,requested_at,rate_window_at,rate_count,updated_at)
      values(${input.invitationId},${input.homeId},${input.partyId},${value.email},${value.locale},true,${value.verifiedGoogle ? now.toISOString() : null},${now.toISOString()},${now.toISOString()},1,${now.toISOString()})
      on conflict(invitation_id) do update set email=excluded.email,locale=excluded.locale,consent=true,
        verified_at=excluded.verified_at,requested_at=excluded.requested_at,generation=guest_contacts.generation+1,
        rate_window_at=${now.toISOString()},
        rate_count=${sameWindow ? prior.rate_count + 1 : 1},updated_at=excluded.updated_at
      returning *
    `;
    if (!contact) throw new GuestContactError("unavailable");
    await tx`update public.guest_email_outbox set status='cancelled',claim_token=null,lease_until=null,error_name='ContactChanged' where contact_id=${contact.id} and status in ('queued','sending','failed')`;
    if (!value.verifiedGoogle)
      await tx`
      insert into public.guest_email_outbox(home_id,contact_id,generation,kind,source_id,available_at,created_at)
      values(${input.homeId},${contact.id},${contact.generation},'verification',${contact.id},${now.toISOString()},${now.toISOString()})
    `;
    return state(contact);
  });
}
export async function disableGuestContact(
  database: DatabaseClient,
  authority: GuestContactAuthority,
  clock: Clock = new SystemClock(),
): Promise<GuestContactState> {
  const now = clock.now();
  return sqlClient(database).begin(async (tx) => {
    const invitation = await assertAuthority(tx, authority, now, true);
    if (invitation.demo) return { status: "demo" as const, email: null };
    const [row] = await tx<
      GuestContactRow[]
    >`update public.guest_contacts set consent=false,generation=generation+1,updated_at=${now.toISOString()} where invitation_id=${authority.invitationId} and home_id=${authority.homeId} and party_id=${authority.partyId} returning *`;
    if (row)
      await tx`update public.guest_email_outbox set status='cancelled',claim_token=null,lease_until=null,error_name='ConsentWithdrawn' where contact_id=${row.id} and status in ('queued','sending','failed')`;
    return state(row);
  });
}
export async function inspectGuestVerification(
  database: DatabaseClient,
  capability: string,
  clock: Clock = new SystemClock(),
  secret?: string,
): Promise<{ locale: "en" | "es" } | null> {
  const current = await contactForCapability(
    sqlClient(database),
    capability,
    "verify",
    clock.now(),
    secret,
  );
  return current ? { locale: current.row.locale } : null;
}
export async function verifyGuestContact(
  database: DatabaseClient,
  capability: string,
  clock: Clock = new SystemClock(),
  secret?: string,
): Promise<{ capability: string; locale: "en" | "es" } | null> {
  const now = clock.now();
  return sqlClient(database).begin(async (tx) => {
    const current = await contactForCapability(
      tx,
      capability,
      "verify",
      now,
      secret,
    );
    if (!current) return null;
    const [verified] = await tx<
      { id: string }[]
    >`update public.guest_contacts set verified_at=${now.toISOString()},updated_at=${now.toISOString()} where id=${current.row.id} and generation=${current.row.generation} and consent and verified_at is null returning id`;
    if (!verified) return null;
    await tx`update public.guest_email_outbox set status='cancelled',claim_token=null,lease_until=null where contact_id=${verified.id} and kind='verification' and status in ('queued','sending','failed')`;
    return {
      capability: mintGuestCapability(current.row, "return", now, secret),
      locale: current.row.locale,
    };
  });
}
export async function resolveGuestReturnCapability(
  database: DatabaseClient,
  capability: string,
  clock: Clock = new SystemClock(),
  secret?: string,
): Promise<
  (GuestContactAuthority & { locale: "en" | "es"; expiresAt: string }) | null
> {
  const current = await contactForCapability(
    sqlClient(database),
    capability,
    "return",
    clock.now(),
    secret,
  );
  if (!current) return null;
  return {
    invitationId: current.row.invitation_id,
    homeId: current.row.home_id,
    partyId: current.row.party_id,
    locale: current.row.locale,
    expiresAt: new Date(current.payload.expires).toISOString(),
  };
}
