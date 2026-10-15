import {
  BedrockAgentCoreControlClient,
  GetAgentRuntimeCommand,
} from "@aws-sdk/client-bedrock-agentcore-control";

import { isDirectExecution, safeErrorMessage } from "./release-helpers";

/**
 * Release 2 entry gate: the contract migration may run only while AgentCore
 * serves the release 1 bundle, which no longer reads the demo column. Compares
 * the deployed runtime version with the version recorded for release 1.
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
      `AgentCore runtime ${runtimeId} serves version ${runtime.version ?? "unknown"}, not the release 1 version ${expectedVersion}; do not apply the contract migration`,
    );
  }
  return `AgentCore runtime ${runtimeId} serves release 1 version ${expectedVersion}`;
}

export function awsRuntimeReader(region: string): RuntimeReader {
  const client = new BedrockAgentCoreControlClient({ region });
  return {
    async read(runtimeId) {
      const output = await client.send(
        new GetAgentRuntimeCommand({ agentRuntimeId: runtimeId }),
      );
      return {
        status: output.status,
        version: output.agentRuntimeVersion,
      };
    },
  };
}

export function parsePreflightArgs(argv: readonly string[]): {
  runtimeId: string;
  expectedVersion: string;
} {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") continue;
    if (argument !== "--runtime-id" && argument !== "--expected-version") {
      throw new Error(`Unknown argument: ${argument}`);
    }
    const value = argv[index + 1];
    if (!value) throw new Error(`${argument} requires a value`);
    values.set(argument, value);
    index += 1;
  }
  const runtimeId = values.get("--runtime-id");
  const expectedVersion = values.get("--expected-version");
  if (!runtimeId || !expectedVersion) {
    throw new Error(
      "Usage: contract-preflight --runtime-id <id> --expected-version <release 1 runtime version>",
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
    awsRuntimeReader(process.env.AWS_REGION ?? "us-east-1"),
  )
    .then((message) => console.log(message))
    .catch((error: unknown) => {
      console.error(safeErrorMessage(error));
      process.exitCode = 1;
    });
}
