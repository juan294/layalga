import { Message, TextBlock, ToolResultBlock } from "@strands-agents/sdk";
import { describe, expect, it } from "vitest";

import type { AgentDeps } from "./deps";
import { TaskScriptedModel } from "./scripted-model-selection";

describe("TaskScriptedModel", () => {
  it("ends the turn after a denied tool result instead of retrying it", async () => {
    const model = new TaskScriptedModel(
      {
        task: "guest_submit",
        homeId: "00000000-0000-4000-8000-000000000001",
        invitationId: "00000000-0000-4000-8000-000000000002",
        stay: ["2026-10-02", "2026-10-04"],
        adults: 2,
        children: 0,
        pets: 0,
        locale: "en",
      },
      {} as AgentDeps,
    );
    const messages = [
      new Message({
        role: "user",
        content: [
          new ToolResultBlock({
            toolUseId: "denied-hold",
            status: "error",
            content: [new TextBlock("The requested dates are unavailable.")],
          }),
        ],
      }),
    ];

    const events = [];
    for await (const event of model.stream(messages)) events.push(event);

    expect(events).toEqual([
      { type: "modelMessageStartEvent", role: "assistant" },
      {
        type: "modelContentBlockDeltaEvent",
        delta: {
          type: "textDelta",
          text: "The requested dates are unavailable.",
        },
      },
      { type: "modelContentBlockStopEvent" },
      { type: "modelMessageStopEvent", stopReason: "endTurn" },
    ]);
  });

  it("prepares a room proposal in the default scripted runtime", async () => {
    const roomId = "00000000-0000-4000-8000-000000000010";
    const model = new TaskScriptedModel(
      {
        task: "host_room_request",
        homeId: "00000000-0000-4000-8000-000000000001",
        hostId: "00000000-0000-4000-8000-000000000002",
        rawMessage:
          "Block Garden room for family use from 2026-09-18 to 2026-09-20.",
        locale: "en",
      },
      {} as AgentDeps,
    );
    const firstEvents = [];
    for await (const event of model.stream([])) firstEvents.push(event);
    expect(firstEvents).toContainEqual(
      expect.objectContaining({
        type: "modelContentBlockStartEvent",
        start: expect.objectContaining({
          type: "toolUseStart",
          name: "list_guest_rooms",
        }),
      }),
    );

    const roomResult = new Message({
      role: "user",
      content: [
        new ToolResultBlock({
          toolUseId: "rooms",
          status: "success",
          content: [
            new TextBlock(
              JSON.stringify({
                rooms: [{ id: roomId, guestLabel: "Garden room" }],
              }),
            ),
          ],
        }),
      ],
    });
    const secondEvents = [];
    for await (const event of model.stream([roomResult])) {
      secondEvents.push(event);
    }
    expect(secondEvents).toContainEqual(
      expect.objectContaining({
        type: "modelContentBlockStartEvent",
        start: expect.objectContaining({
          type: "toolUseStart",
          name: "prepare_room_action",
        }),
      }),
    );
    expect(secondEvents).toContainEqual(
      expect.objectContaining({
        type: "modelContentBlockDeltaEvent",
        delta: expect.objectContaining({
          input: expect.stringContaining(roomId),
        }),
      }),
    );
  });
});
