import { describe, expect, it } from "vitest";

import {
  assertNoAssistantEndpoint,
  assertNoScriptedModel,
} from "./agent-bundle-guard.mjs";

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

describe("assertNoAssistantEndpoint", () => {
  it.each([
    "src/mcp/server.ts",
    "src/app/api/mcp/route.ts",
    "src/lib/auth/assistant-bearer.ts",
    "../src/mcp/tools.ts",
  ])("fails when the AgentCore bundle includes %s", (path) => {
    expect(() =>
      assertNoAssistantEndpoint({
        inputs: { "src/agent/runtime/handler.ts": {}, [path]: {} },
      }),
    ).toThrow(
      `assistant endpoint must not ship in the AgentCore bundle: ${path}`,
    );
  });

  it("accepts the shared audience constant that env.ts reads", () => {
    expect(() =>
      assertNoAssistantEndpoint({
        inputs: {
          "src/agent/runtime/handler.ts": {},
          "src/core/assistant-access/audience.ts": {},
          "src/lib/server/env.ts": {},
          "src/agent/mcp-free-helper.ts": {},
          // A dependency's own folders are not the project's endpoint.
          "node_modules/@strands-agents/sdk/dist/src/mcp/client.js": {},
        },
      }),
    ).not.toThrow();
  });
});
