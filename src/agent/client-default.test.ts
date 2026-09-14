import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock("@aws-sdk/client-bedrock-agentcore", () => {
  class FakeClient {
    send = mocks.send;
  }
  class InvokeAgentRuntimeCommand {
    constructor(public readonly input: Record<string, unknown>) {}
  }
  return { BedrockAgentCoreClient: FakeClient, InvokeAgentRuntimeCommand };
});

import { AgentCoreClient } from "./client";

const task = {
  task: "tick" as const,
  homeId: "11111111-1111-4111-8111-111111111111",
  jobId: "22222222-2222-4222-8222-222222222222",
};

describe("AgentCoreClient default AWS adapter", () => {
  it("serializes a request and parses the returned response", async () => {
    mocks.send.mockResolvedValue({
      contentType: "application/json",
      response: {
        transformToString: async () => JSON.stringify({ status: "completed" }),
      },
    });

    await expect(new AgentCoreClient("runtime-arn", "eu-west-1").run(task)).resolves.toEqual({
      status: "completed",
    });
    expect(mocks.send).toHaveBeenCalledOnce();
    expect(mocks.send.mock.calls[0]?.[0].input).toMatchObject({
      agentRuntimeArn: "runtime-arn",
      contentType: "application/json",
      accept: "text/plain",
      payload: new TextEncoder().encode(JSON.stringify(task)),
    });
  });

  it("rejects an empty AWS response", async () => {
    mocks.send.mockResolvedValue({ response: undefined });

    await expect(new AgentCoreClient("runtime-arn", "eu-west-1").run(task)).rejects.toThrow(
      "empty response",
    );
  });
});
