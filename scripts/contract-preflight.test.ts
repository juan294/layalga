import { describe, expect, it } from "vitest";

import { GetAgentRuntimeEndpointCommand } from "@aws-sdk/client-bedrock-agentcore-control";

import {
  awsRuntimeReader,
  contractPreflight,
  parsePreflightArgs,
} from "./contract-preflight";

const reader = (status: string, version: string) => ({
  read: async () => ({ status, version }),
});

describe("contractPreflight", () => {
  it("passes only when the runtime serves the expected version", async () => {
    await expect(
      contractPreflight("runtime-1", "31", reader("READY", "31")),
    ).resolves.toContain("serves the expected version 31");
  });

  it("stops when the runtime serves another version", async () => {
    await expect(
      contractPreflight("runtime-1", "31", reader("READY", "30")),
    ).rejects.toThrow("serves version 30, not the expected version 31");
  });

  it("stops while the runtime is not ready", async () => {
    await expect(
      contractPreflight("runtime-1", "31", reader("UPDATING", "31")),
    ).rejects.toThrow("not READY");
  });

  it("requires both arguments", () => {
    expect(
      parsePreflightArgs([
        "--",
        "--runtime-id",
        "r",
        "--expected-version",
        "31",
      ]),
    ).toEqual({ runtimeId: "r", expectedVersion: "31" });
    expect(() => parsePreflightArgs(["--runtime-id", "r"])).toThrow("Usage");
  });

  it("reads the version the DEFAULT endpoint serves", async () => {
    const sent: unknown[] = [];
    const client = {
      send: async (command: unknown) => {
        sent.push(command);
        return { status: "READY", liveVersion: "39" };
      },
    };
    await expect(awsRuntimeReader(client).read("runtime-1")).resolves.toEqual({
      status: "READY",
      version: "39",
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toBeInstanceOf(GetAgentRuntimeEndpointCommand);
    expect((sent[0] as GetAgentRuntimeEndpointCommand).input).toEqual({
      agentRuntimeId: "runtime-1",
      endpointName: "DEFAULT",
    });
  });
});
