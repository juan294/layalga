import { describe, expect, it } from "vitest";

import { ScriptedModel } from "./scripted-model";

describe("ScriptedModel", () => {
  it("streams text and tool-use steps in SDK event order", async () => {
    const model = new ScriptedModel([
      { text: "Done" },
      { toolUse: { name: "notify", input: { kind: "test" } } },
    ]);

    expect(await collect(model)).toEqual([
      { type: "modelMessageStartEvent", role: "assistant" },
      { type: "modelContentBlockDeltaEvent", delta: { type: "textDelta", text: "Done" } },
      { type: "modelContentBlockStopEvent" },
      { type: "modelMessageStopEvent", stopReason: "endTurn" },
    ]);
    expect(await collect(model)).toEqual([
      { type: "modelMessageStartEvent", role: "assistant" },
      {
        type: "modelContentBlockStartEvent",
        start: { type: "toolUseStart", name: "notify", toolUseId: "scripted-2" },
      },
      {
        type: "modelContentBlockDeltaEvent",
        delta: { type: "toolUseInputDelta", input: '{"kind":"test"}' },
      },
      { type: "modelContentBlockStopEvent" },
      { type: "modelMessageStopEvent", stopReason: "toolUse" },
    ]);
    expect(model.getConfig()).toEqual({ modelId: "scripted" });
  });
});

async function collect(model: ScriptedModel) {
  const events = [];
  for await (const event of model.stream([])) events.push(event);
  return events;
}
