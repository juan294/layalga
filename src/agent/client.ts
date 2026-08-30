import { randomUUID } from "node:crypto";

import {
  BedrockAgentCoreClient as AwsBedrockAgentCoreClient,
  InvokeAgentRuntimeCommand,
} from "@aws-sdk/client-bedrock-agentcore";

import type { AgentTask, RunResult } from "./task";
import { LocalAgentClient, type AgentClient } from "./runtime/local";

export class AgentCoreClient implements AgentClient {
  private readonly client: AwsBedrockAgentCoreClient;

  constructor(
    private readonly runtimeArn = required("AGENTCORE_RUNTIME_ARN"),
    region = process.env.AWS_REGION ?? "us-east-1",
  ) {
    this.client = new AwsBedrockAgentCoreClient({ region });
  }

  async run(payload: AgentTask): Promise<RunResult> {
    const response = await this.client.send(
      new InvokeAgentRuntimeCommand({
        agentRuntimeArn: this.runtimeArn,
        runtimeSessionId: randomUUID(),
        contentType: "application/json",
        accept: "application/json, text/event-stream",
        payload: new TextEncoder().encode(JSON.stringify(payload)),
      }),
    );
    if (!response.response) throw new Error("AgentCore returned an empty response");
    const body = await response.response.transformToString();
    return parseAgentCoreResponse(body, response.contentType);
  }
}

export function getAgentClient(): AgentClient {
  return process.env.AGENT_RUNTIME === "agentcore"
    ? new AgentCoreClient()
    : new LocalAgentClient();
}

export function parseAgentCoreResponse(body: string, contentType?: string): RunResult {
  if (!contentType?.includes("text/event-stream")) return JSON.parse(body) as RunResult;
  const data = body
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter(Boolean);
  if (data.length === 0) throw new Error("AgentCore returned empty SSE data");
  return JSON.parse(data.at(-1)!) as RunResult;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
