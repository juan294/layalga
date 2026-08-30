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
});
