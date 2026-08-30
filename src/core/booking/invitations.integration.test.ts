import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import {
  captureInvitation,
  findInvitationByToken,
  reissueInvitationLink,
} from "./invitations";

const connectionUrl =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54622/postgres";
const db = postgres(connectionUrl, { max: 2, prepare: false });

describe("invitation persistence", () => {
  afterAll(async () => {
    await db.end({ timeout: 5 });
  });

  it("stores only the token HMAC and resolves the raw guest token", async () => {
    const suffix = randomUUID();
    const [home] = await db<{ id: string }[]>`
      insert into public.homes (name, timezone)
      values (${`Invitation ${suffix}`}, 'Europe/Madrid')
      returning id
    `;
    if (!home) throw new Error("Failed to seed invitation home");
    const [host] = await db<{ id: string }[]>`
      insert into public.hosts (home_id, display_name, locale)
      values (${home.id}, 'Host', 'en')
      returning id
    `;
    if (!host) throw new Error("Failed to seed invitation host");

    const secret = "integration-token-secret";
    try {
      const captured = await captureInvitation(db, {
        homeId: home.id,
        hostId: host.id,
        partyName: "Test family",
        partyLocale: "en",
        rawMessage: "Come for a weekend",
        structured: { adults: 2 },
        tokenSecret: secret,
        appUrl: "https://example.test",
        now: new Date("2026-08-31T10:00:00.000Z"),
      });

      const token = new URL(captured.guestLink).pathname.split("/").at(-1);
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(captured.guestLink).toBe(`https://example.test/en/g/${token}`);
      const [stored] = await db<
        { link_token: string; link_token_expires_at: Date }[]
      >`
        select link_token, link_token_expires_at
        from public.invitations where id = ${captured.invitationId}
      `;
      expect(stored?.link_token).not.toBe(token);
      expect(stored?.link_token_expires_at.toISOString()).toBe(
        "2026-09-30T10:00:00.000Z",
      );

      if (!token) throw new Error("Guest link token is missing");
      const found = await findInvitationByToken(db, token, secret);
      expect(found).toMatchObject({
        id: captured.invitationId,
        partyId: captured.partyId,
        partyName: "Test family",
        structured: { adults: 2 },
      });
      expect(await findInvitationByToken(db, token, "wrong-secret")).toBeNull();

      const reissued = await reissueInvitationLink(db, captured.invitationId, {
        now: new Date("2026-09-02T10:00:00.000Z"),
        tokenSecret: secret,
        appUrl: "https://example.test",
      });
      const replacement = new URL(reissued).pathname.split("/").at(-1);
      expect(replacement).not.toBe(token);
      expect(await findInvitationByToken(db, token!, secret)).toBeNull();
      expect(
        await findInvitationByToken(db, replacement!, secret),
      ).toMatchObject({
        id: captured.invitationId,
      });
    } finally {
      await db`delete from public.homes where id = ${home.id}`;
    }
  });

  it("keeps each family invitation link bound to its original invitation", async () => {
    const suffix = randomUUID();
    const [home] = await db<{ id: string }[]>`
      insert into public.homes (name, timezone)
      values (${`Stable invitation ${suffix}`}, 'Europe/Madrid')
      returning id
    `;
    if (!home) throw new Error("Failed to seed invitation home");
    const [host] = await db<{ id: string }[]>`
      insert into public.hosts (home_id, display_name, locale)
      values (${home.id}, 'Host', 'en')
      returning id
    `;
    if (!host) throw new Error("Failed to seed invitation host");

    const secret = "stable-invitation-secret";
    try {
      const first = await captureInvitation(db, {
        homeId: home.id,
        hostId: host.id,
        partyName: "Returning family",
        partyLocale: "en",
        rawMessage: "First visit",
        tokenSecret: secret,
        appUrl: "https://example.test",
        now: new Date("2026-08-31T10:00:00.000Z"),
      });
      const second = await captureInvitation(db, {
        homeId: home.id,
        hostId: host.id,
        partyName: "Returning family",
        partyLocale: "en",
        rawMessage: "Second visit",
        tokenSecret: secret,
        appUrl: "https://example.test",
        now: new Date("2026-09-01T10:00:00.000Z"),
      });
      const firstToken = new URL(first.guestLink).pathname.split("/").at(-1)!;
      const secondToken = new URL(second.guestLink).pathname.split("/").at(-1)!;

      expect(await findInvitationByToken(db, firstToken, secret)).toMatchObject({
        id: first.invitationId,
        rawMessage: "First visit",
      });
      expect(await findInvitationByToken(db, secondToken, secret)).toMatchObject({
        id: second.invitationId,
        rawMessage: "Second visit",
      });

      const replacementLink = await reissueInvitationLink(
        db,
        second.invitationId,
        {
          tokenSecret: secret,
          appUrl: "https://example.test",
          now: new Date("2026-09-02T10:00:00.000Z"),
        },
      );
      const replacementToken = new URL(replacementLink).pathname
        .split("/")
        .at(-1)!;

      expect(await findInvitationByToken(db, firstToken, secret)).toMatchObject({
        id: first.invitationId,
      });
      expect(await findInvitationByToken(db, secondToken, secret)).toBeNull();
      expect(
        await findInvitationByToken(db, replacementToken, secret),
      ).toMatchObject({ id: second.invitationId });
    } finally {
      await db`delete from public.homes where id = ${home.id}`;
    }
  });
});
