import { parseArgs } from "node:util";

import {
  BedrockAgentCoreControlClient,
  GetAgentRuntimeEndpointCommand,
} from "@aws-sdk/client-bedrock-agentcore-control";

import { isDirectExecution, safeErrorMessage } from "./release-helpers";

/**
 * Release 2 entry gate: the contract migration may run only while AgentCore
 * serves a bundle that no longer reads the demo schema (release 1 or later).
 * Compares the version the DEFAULT endpoint serves with the version the
 * operator recorded for that bundle.
 */
export interface RuntimeReader {
  read(runtimeId: string): Promise<{ status?: string; version?: string }>;
}

export async function contractPreflight(
  runtimeId: string,
  expectedVersion: string,
  reader: RuntimeReader,
): Promise<string> {
  const runtime = await reader.read(runtimeId);
  if (runtime.status !== "READY") {
    throw new Error(
      `AgentCore runtime ${runtimeId} is ${runtime.status ?? "unknown"}, not READY; do not apply the contract migration`,
    );
  }
  if (runtime.version !== expectedVersion) {
    throw new Error(
      `AgentCore runtime ${runtimeId} serves version ${runtime.version ?? "unknown"}, not the expected version ${expectedVersion}; do not apply the contract migration`,
    );
  }
  return `AgentCore runtime ${runtimeId} serves the expected version ${expectedVersion}`;
}

interface EndpointClient {
  send(
    command: GetAgentRuntimeEndpointCommand,
  ): Promise<{ status?: string; liveVersion?: string }>;
}

/** Reads the DEFAULT endpoint, which serves invocations, not the newest runtime version. */
export function awsRuntimeReader(client: EndpointClient): RuntimeReader {
  return {
    async read(runtimeId) {
      const output = await client.send(
        new GetAgentRuntimeEndpointCommand({
          agentRuntimeId: runtimeId,
          endpointName: "DEFAULT",
        }),
      );
      return { status: output.status, version: output.liveVersion };
    },
  };
}

export function parsePreflightArgs(argv: readonly string[]): {
  runtimeId: string;
  expectedVersion: string;
} {
  const { values } = parseArgs({
    args: argv.filter((argument) => argument !== "--"),
    options: {
      "runtime-id": { type: "string" },
      "expected-version": { type: "string" },
    },
    strict: true,
  });
  const runtimeId = values["runtime-id"];
  const expectedVersion = values["expected-version"];
  if (!runtimeId || !expectedVersion) {
    throw new Error(
      "Usage: contract-preflight --runtime-id <id> --expected-version <runtime version recorded for the deployed release>",
    );
  }
  return { runtimeId, expectedVersion };
}

if (isDirectExecution(import.meta.url, process.argv[1])) {
  const { runtimeId, expectedVersion } = parsePreflightArgs(
    process.argv.slice(2),
  );
  contractPreflight(
    runtimeId,
    expectedVersion,
    awsRuntimeReader(
      new BedrockAgentCoreControlClient({
        region: process.env.AWS_REGION?.trim() || "us-east-1",
      }),
    ),
  )
    .then((message) => console.log(message))
    .catch((error: unknown) => {
      console.error(safeErrorMessage(error));
      process.exitCode = 1;
    });
}
