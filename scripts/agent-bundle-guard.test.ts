import { describe, expect, it } from "vitest";

import { assertNoScriptedModel } from "./agent-bundle-guard.mjs";

describe("assertNoScriptedModel", () => {
  it("fails when the AgentCore bundle includes the scripted model", () => {
    expect(() =>
      assertNoScriptedModel({
        inputs: {
          "src/agent/runtime/handler.ts": {},
          "src/agent/scripted-model.ts": {},
        },
      }),
    ).toThrow("scripted model must not ship in the AgentCore bundle");
  });

  it("accepts a bundle without scripted model inputs", () => {
    expect(() =>
      assertNoScriptedModel({
        inputs: {
          "src/agent/runtime/handler.ts": {},
          "src/agent/scripted-outcomes.ts": {},
        },
      }),
    ).not.toThrow();
  });
});
