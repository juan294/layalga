import { describe, expect, it } from "vitest";

import { parseAgentCoreRequest } from "./request";

describe("AgentCore request boundary", () => {
  it("parses a valid task with the application schema", () => {
    expect(
      parseAgentCoreRequest({
        task: "tick",
        homeId: "11111111-1111-4111-8111-111111111111",
        jobId: "22222222-2222-4222-8222-222222222222",
      }),
    ).toMatchObject({ task: "tick" });
  });

  it("rejects invalid input before task execution", () => {
    expect(() => parseAgentCoreRequest({ task: "tick" })).toThrow();
  });
});
