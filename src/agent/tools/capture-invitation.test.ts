import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { FakeClock } from "@/core/clock";

import { NoopScheduler } from "../deps";
import type { AgentDeps } from "../ports";
import { cleanupHost, seedHost } from "../testing/seed-host";
import { captureInvitationTool } from "./capture-invitation";

const url =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54622/postgres";
const sql = postgres(url, { prepare: false });

describe("captureInvitationTool: rememberedContext", () => {
  afterAll(() => sql.end());

  const previousSecret = process.env.LINK_TOKEN_SECRET;
  beforeEach(() => {
    process.env.LINK_TOKEN_SECRET = "capture-invitation-test-secret";
  });
  afterEach(() => {
    if (previousSecret === undefined) delete process.env.LINK_TOKEN_SECRET;
    else process.env.LINK_TOKEN_SECRET = previousSecret;
  });

  it("stores rememberedContext separately and removes any specialRequests entry that only echoes it", async () => {
    const fixture = await seedHost(sql, `Capture remembered ${randomUUID()}`);
    try {
      const deps = agentDeps(fixture.homeId, fixture.hostId);
      const result = await captureInvitationTool(deps).invoke({
        partyName: "Vega",
        partyLocale: "es",
        adults: 2,
        children: 2,
        pets: 0,
        flexibleDates: { text: "mediados de septiembre" },
        specialRequests: ["  Habitación en Planta Baja  ", "trae un perrito"],
        rememberedContext: [
          "habitacion en planta baja",
          "llega tarde los viernes",
        ],
        rawMessage: "Oye, los Vega quieren venir un finde de septiembre.",
      });

      const [row] = await sql<{ structured: Record<string, unknown> }[]>`
        select structured from public.invitations where id = ${result.invitationId}
      `;
      const structured = row!.structured;
      expect(structured.rememberedContext).toEqual([
        "habitacion en planta baja",
        "llega tarde los viernes",
      ]);
      // The fold-matching entry ("Habitación en Planta Baja" ~=
      // "habitacion en planta baja") is removed; the unrelated entry stays.
      expect(structured.specialRequests).toEqual(["trae un perrito"]);
    } finally {
      await cleanupHost(sql, fixture);
    }
  });

  it("keeps every specialRequests entry when none matches a rememberedContext entry", async () => {
    const fixture = await seedHost(sql, `Capture unmatched ${randomUUID()}`);
    try {
      const deps = agentDeps(fixture.homeId, fixture.hostId);
      const result = await captureInvitationTool(deps).invoke({
        partyName: "Oteros",
        partyLocale: "en",
        adults: 2,
        children: 0,
        pets: 1,
        flexibleDates: { text: "the 19th" },
        specialRequests: ["ground-floor access for a wheelchair"],
        rememberedContext: ["arrives with a small dog"],
        rawMessage: "Inviting Ana and Pelayo Otero for the weekend.",
      });

      const [row] = await sql<{ structured: Record<string, unknown> }[]>`
        select structured from public.invitations where id = ${result.invitationId}
      `;
      expect(row!.structured.specialRequests).toEqual([
        "ground-floor access for a wheelchair",
      ]);
      expect(row!.structured.rememberedContext).toEqual([
        "arrives with a small dog",
      ]);
    } finally {
      await cleanupHost(sql, fixture);
    }
  });

  it("omits rememberedContext from structured when the model does not supply it", async () => {
    const fixture = await seedHost(sql, `Capture absent ${randomUUID()}`);
    try {
      const deps = agentDeps(fixture.homeId, fixture.hostId);
      const result = await captureInvitationTool(deps).invoke({
        partyName: "Smith",
        partyLocale: "en",
        adults: 1,
        children: 0,
        pets: 0,
        flexibleDates: { text: "next month" },
        specialRequests: [],
        rawMessage: "Invite the Smiths next month.",
      });

      const [row] = await sql<{ structured: Record<string, unknown> }[]>`
        select structured from public.invitations where id = ${result.invitationId}
      `;
      expect(row!.structured).not.toHaveProperty("rememberedContext");
    } finally {
      await cleanupHost(sql, fixture);
    }
  });
});

function agentDeps(homeId: string, hostId: string): AgentDeps {
  return {
    db: sql,
    clock: new FakeClock(new Date("2026-09-01T10:00:00Z")),
    scheduler: new NoopScheduler(),
    appUrl: "http://localhost:3008",
    locale: "en",
    authority: { homeId, hostId },
  };
}
