import { describe, expect, it } from "vitest";

import {
  MAX_ADULTS,
  MAX_ARRIVAL_TIME_LENGTH,
  MAX_CHILDREN,
  MAX_DECISION_NOTE_LENGTH,
  MAX_GUEST_MESSAGE_LENGTH,
  MAX_GUEST_NOTES_LENGTH,
  MAX_HOST_MESSAGE_LENGTH,
  MAX_PETS,
} from "./task-limits";
import { agentTaskSchema } from "./task";

const homeId = "10000000-0000-4000-8000-000000000001";
const invitationId = "10000000-0000-4000-8000-000000000002";
const visitId = "10000000-0000-4000-8000-000000000003";

describe("agent task business limits", () => {
  it("accepts the largest supported family submission", () => {
    expect(
      agentTaskSchema.safeParse({
        task: "guest_submit",
        homeId,
        invitationId,
        stay: ["2026-10-01", "2026-10-03"],
        adults: MAX_ADULTS,
        children: MAX_CHILDREN,
        pets: MAX_PETS,
        arrivalTime: "a".repeat(MAX_ARRIVAL_TIME_LENGTH),
        notes: "n".repeat(MAX_GUEST_NOTES_LENGTH),
        locale: "en",
      }).success,
    ).toBe(true);
  });

  it.each([
    ["adults", MAX_ADULTS + 1],
    ["children", MAX_CHILDREN + 1],
    ["pets", MAX_PETS + 1],
    ["arrivalTime", "a".repeat(MAX_ARRIVAL_TIME_LENGTH + 1)],
    ["notes", "n".repeat(MAX_GUEST_NOTES_LENGTH + 1)],
  ])("rejects an oversized guest %s value", (field, value) => {
    const task = {
      task: "guest_submit",
      homeId,
      invitationId,
      stay: ["2026-10-01", "2026-10-03"],
      adults: 2,
      children: 0,
      pets: 0,
      locale: "en",
      [field]: value,
    };
    expect(agentTaskSchema.safeParse(task).success).toBe(false);
  });

  it("bounds all public free-text task inputs", () => {
    expect(
      agentTaskSchema.safeParse({
        task: "host_capture",
        homeId,
        hostId: invitationId,
        rawMessage: "h".repeat(MAX_HOST_MESSAGE_LENGTH + 1),
        locale: "en",
      }).success,
    ).toBe(false);
    expect(
      agentTaskSchema.safeParse({
        task: "host_room_request",
        homeId,
        hostId: invitationId,
        rawMessage: "h".repeat(MAX_HOST_MESSAGE_LENGTH + 1),
        locale: "en",
      }).success,
    ).toBe(false);
    expect(
      agentTaskSchema.safeParse({
        task: "guest_change",
        homeId,
        visitId,
        message: "g".repeat(MAX_GUEST_MESSAGE_LENGTH + 1),
        locale: "en",
      }).success,
    ).toBe(false);
    expect(
      agentTaskSchema.safeParse({
        task: "resume",
        homeId,
        sessionId: "capture_host",
        responses: [
          {
            interruptId: "decision",
            response: {
              approved: true,
              hostId: invitationId,
              note: "n".repeat(MAX_DECISION_NOTE_LENGTH + 1),
            },
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("accepts a bounded host room request", () => {
    expect(
      agentTaskSchema.safeParse({
        task: "host_room_request",
        homeId,
        hostId: invitationId,
        rawMessage: "Close the office from 2026-10-01 to 2026-10-03.",
        locale: "en",
      }).success,
    ).toBe(true);
  });
});
