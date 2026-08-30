import { describe, expect, it } from "vitest";

import {
  applyChase,
  applyEscalation,
  applyGuestAnswer,
  planChase,
  type ReconfirmationVisit,
} from "./state-machine";

const confirmedAt = new Date("2026-09-07T10:00:00+02:00");
const visit: ReconfirmationVisit = {
  id: "00000000-0000-4000-8000-000000000501",
  homeId: "00000000-0000-4000-8000-000000000001",
  stayStart: "2026-09-18",
  status: "confirmed",
  confirmedAt,
  reconfirmRequestedAt: null,
  reconfirmedAt: null,
  escalatedAt: null,
};

describe("reconfirmation state machine", () => {
  it("plans T-3, chases, escalates, and cancels escalation after an answer", () => {
    const planned = planChase(visit, "Europe/Madrid");
    expect(planned.jobs).toEqual([
      {
        type: "create",
        homeId: visit.homeId,
        visitId: visit.id,
        kind: "reconfirm_chase",
        dueAt: new Date("2026-09-15T09:00:00+02:00"),
      },
    ]);

    const chaseAt = new Date("2026-09-15T09:00:00+02:00");
    const chased = applyChase(visit, chaseAt);
    expect(chased.visit).toMatchObject({
      status: "reconfirm_pending",
      reconfirmRequestedAt: chaseAt,
    });
    expect(chased.jobs).toEqual([
      {
        type: "create",
        homeId: visit.homeId,
        visitId: visit.id,
        kind: "reconfirm_escalate",
        dueAt: new Date("2026-09-16T09:00:00+02:00"),
      },
    ]);

    const escalationAt = new Date("2026-09-16T09:05:00+02:00");
    expect(applyEscalation(chased.visit, escalationAt).visit).toMatchObject({
      status: "escalated",
      escalatedAt: escalationAt,
    });

    const answerAt = new Date("2026-09-15T18:00:00+02:00");
    const answered = applyGuestAnswer(chased.visit, "yes", answerAt);
    expect(answered.visit).toMatchObject({
      status: "reconfirmed",
      reconfirmedAt: answerAt,
    });
    expect(answered.jobs).toEqual([
      {
        type: "cancel",
        visitId: visit.id,
        kind: "reconfirm_escalate",
      },
    ]);
    expect(applyEscalation(answered.visit, escalationAt).jobs).toEqual([]);
  });

  it("makes an already-past chase due immediately", () => {
    const now = new Date("2026-09-16T10:00:00+02:00");
    const planned = planChase({ ...visit, confirmedAt: now }, "Europe/Madrid");

    expect(planned.jobs[0]).toMatchObject({ dueAt: now });
  });
});
