import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { FakeClock } from "@/core/clock";
import type { DatabaseClient } from "@/core/db/client";

import type { GuestSql } from "./guest-contact";
import {
  disableGuestContact,
  inspectGuestVerification,
  loadGuestContact,
  loadLiveGuestContact,
  mintGuestCapability,
  registerGuestContact,
  resolveGuestReturnCapability,
  verifyGuestContact,
  type GuestContactRow,
} from "./guest-contact";

const homeId = "11111111-1111-4111-8111-111111111111";
const invitationId = "22222222-2222-4222-8222-222222222222";
const partyId = "33333333-3333-4333-8333-333333333333";
const secret = "test-secret-with-enough-entropy";
const now = new Date("2026-09-13T10:00:00.000Z");
const authority = { homeId, partyId, invitationId };

const row: GuestContactRow = {
  id: "55555555-5555-4555-8555-555555555555",
  invitation_id: invitationId,
  home_id: homeId,
  party_id: partyId,
  email: "family@example.test",
  locale: "es",
  generation: 1,
  consent: true,
  verified_at: null,
  requested_at: new Date("2026-09-13T09:00:00.000Z"),
  rate_window_at: new Date("2026-09-13T09:00:00.000Z"),
  rate_count: 1,
  link_token: "opaque-link-token",
  link_token_expires_at: new Date("2026-10-13T10:00:00.000Z"),
  demo: false,
};

function fakeDatabase(options: {
  demo?: boolean;
  contact?: GuestContactRow | null;
  failure?: { failed: boolean } | null;
  prior?: GuestContactRow | null;
}) {
  const sql = vi.fn((strings: TemplateStringsArray) => {
    const query = strings.join(" ");
    if (query.includes("select home.demo from public.invitations")) {
      return options.demo === undefined ? [{ demo: false }] : [{ demo: options.demo }];
    }
    if (query.includes("from public.guest_contacts contact")) {
      return options.contact ? [options.contact] : [];
    }
    if (query.includes("select * from public.guest_contacts where invitation_id")) {
      return options.contact ? [options.contact] : [];
    }
    if (query.includes("status='failed'")) {
      return options.failure ? [options.failure] : [];
    }
    if (query.includes("insert into public.guest_contacts")) {
      return options.contact ? [options.contact] : [];
    }
    if (query.includes("update public.guest_contacts set verified_at")) {
      return options.contact ? [{ id: options.contact.id }] : [];
    }
    if (query.includes("update public.guest_contacts set consent=false")) {
      return options.contact ? [{ ...options.contact, consent: false }]: [];
    }
    return [];
  });
  Object.assign(sql, {
    begin: vi.fn(async (callback: (tx: typeof sql) => unknown) => callback(sql)),
  });
  return sql as unknown as DatabaseClient;
}

describe("guest contact capability and state boundaries", () => {
  it("mints capabilities and validates verification and return flows", async () => {
    const clock = new FakeClock(now);
    const database = fakeDatabase({ contact: row });
    const verification = mintGuestCapability(row, "verify", now, secret);

    await expect(
      loadLiveGuestContact(database as unknown as GuestSql, row.id, now),
    ).resolves.toEqual(row);
    const [encoded, signature] = verification.split(".");
    expect(encoded).toBeTruthy();
    expect(signature).toMatch(/^[a-f0-9]{64}$/);
    const payload = JSON.parse(Buffer.from(encoded!, "base64url").toString("utf8"));
    expect(payload).toMatchObject({
      purpose: "verify",
      contactId: row.id,
      invitationId,
      generation: row.generation,
    });
    expect(payload.fingerprint).toBe(
      createHmac("sha256", secret)
        .update(`guest-invitation-fingerprint:v1:${row.link_token}`)
        .digest("hex"),
    );
    expect(signature).toBe(
      createHmac("sha256", secret)
        .update(`guest-capability:v1:verify:${encoded}`)
        .digest("hex"),
    );
    await expect(inspectGuestVerification(database, verification, clock, secret)).resolves.toEqual({
      locale: "es",
    });
    await expect(
      verifyGuestContact(database, verification, clock, secret),
    ).resolves.toMatchObject({ capability: expect.any(String), locale: "es" });

    const verified = { ...row, verified_at: now };
    const returnCapability = mintGuestCapability(verified, "return", now, secret);
    const resolved = await resolveGuestReturnCapability(
      fakeDatabase({ contact: verified }),
      returnCapability,
      clock,
      secret,
    );
    expect(resolved).toMatchObject({ homeId, partyId, invitationId, locale: "es" });
    expect(resolved?.expiresAt).toBeTruthy();
  });

  it("rejects malformed, expired, wrong-purpose, and missing capabilities", async () => {
    const clock = new FakeClock(now);
    const database = fakeDatabase({ contact: row });
    const verification = mintGuestCapability(row, "verify", now, secret);

    await expect(inspectGuestVerification(database, "bad", clock, secret)).resolves.toBeNull();
    await expect(
      inspectGuestVerification(database, verification, new FakeClock(new Date("2026-10-14T00:00:00Z")), secret),
    ).resolves.toBeNull();
    await expect(
      resolveGuestReturnCapability(database, verification, clock, secret),
    ).resolves.toBeNull();
    await expect(inspectGuestVerification(database, verification, clock, "wrong-secret"))
      .resolves.toBeNull();
    expect(() => mintGuestCapability(row, "verify", now, "")).toThrow();
  });

  it("loads live contact and reports demo, delivery, and contact states", async () => {
    const clock = new FakeClock(now);
    await expect(
      loadLiveGuestContact(
        fakeDatabase({ contact: row }) as unknown as GuestSql,
        row.id,
        now,
      ),
    ).resolves.toEqual(row);
    await expect(
      loadLiveGuestContact(fakeDatabase({}) as unknown as GuestSql, row.id, now),
    ).resolves.toBeNull();

    await expect(loadGuestContact(fakeDatabase({ contact: row, failure: { failed: true } }), authority, clock)).resolves.toEqual({
      status: "unverified",
      email: row.email,
      deliveryFailed: true,
    });
    await expect(loadGuestContact(fakeDatabase({ demo: true }), authority, clock)).resolves.toEqual({
      status: "demo",
      email: null,
    });
    await expect(loadGuestContact(fakeDatabase({ contact: null }), authority, clock)).resolves.toEqual({
      status: "no_contact",
      email: null,
      deliveryFailed: false,
    });
  });

  it("registers, rate-limits, and disables a guest contact", async () => {
    const clock = new FakeClock(now);
    const registered = await registerGuestContact(
      fakeDatabase({ contact: row }),
      {
        ...authority,
        email: "new@example.test",
        locale: "en",
        consent: true,
      },
      clock,
      secret,
    );
    expect(registered).toEqual({ status: "unverified", email: row.email });

    await expect(
      registerGuestContact(fakeDatabase({ contact: row }), { ...authority, email: "bad", locale: "en", consent: true }, clock, secret),
    ).rejects.toMatchObject({ code: "invalid" });
    await expect(
      registerGuestContact(
        fakeDatabase({ contact: { ...row, rate_count: 3 } }),
        { ...authority, email: "new@example.test", locale: "en", consent: true },
        clock,
        secret,
      ),
    ).rejects.toMatchObject({ code: "rate_limit" });
    await expect(
      registerGuestContact(fakeDatabase({ demo: true }), { ...authority, email: "new@example.test", locale: "en", consent: true }, clock, secret),
    ).resolves.toEqual({ status: "demo", email: null });

    await expect(disableGuestContact(fakeDatabase({ contact: row }), authority, clock)).resolves.toEqual({
      status: "disabled",
      email: row.email,
    });
    await expect(disableGuestContact(fakeDatabase({ contact: null }), authority, clock)).resolves.toEqual({
      status: "no_contact",
      email: null,
    });
    await expect(disableGuestContact(fakeDatabase({ demo: true }), authority, clock)).resolves.toEqual({
      status: "demo",
      email: null,
    });
  });
});
