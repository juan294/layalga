import { randomUUID } from "node:crypto";

import {
  BedrockAgentCoreClient as AwsBedrockAgentCoreClient,
  InvokeAgentRuntimeCommand,
} from "@aws-sdk/client-bedrock-agentcore";

import { enqueueAgentTask, type RunAgentDeps } from "./run-task";
import type { AgentTask, RunResult } from "./task";
import type { AgentRunAccepted } from "./runtime/async-execution";
import { runtimeDeps } from "./runtime/deps";
import { LocalAgentClient, type AgentClient } from "./runtime/local";
import type { ExecuteAgentRunRequest } from "./runtime/request";
import { parseServerEnvironment } from "@/lib/server/env";

type AgentCoreInvoke = (request: unknown) => Promise<unknown>;

interface AgentCoreClientOptions {
  invoke?: AgentCoreInvoke;
  depsForTask?: (task: AgentTask) => Promise<RunAgentDeps>;
  persist?: (task: AgentTask, deps: RunAgentDeps) => Promise<RunResult>;
}

export class AgentCoreClient implements AgentClient {
  private readonly invoke: AgentCoreInvoke;
  private readonly depsForTask: (task: AgentTask) => Promise<RunAgentDeps>;
  private readonly persist: (
    task: AgentTask,
    deps: RunAgentDeps,
  ) => Promise<RunResult>;

  constructor(
    runtimeArn: string,
    region: string,
    options: AgentCoreClientOptions = {},
  ) {
    this.invoke = options.invoke ?? createAgentCoreInvoker(runtimeArn, region);
    this.depsForTask = options.depsForTask ?? runtimeDeps;
    this.persist = options.persist ?? enqueueAgentTask;
  }

  async run(payload: AgentTask): Promise<RunResult> {
    return (await this.invoke(payload)) as RunResult;
  }

  async enqueue(
    payload: AgentTask,
    options: { opportunistic?: boolean } = {},
  ): Promise<RunResult> {
    const result = await this.persist(payload, await this.depsForTask(payload));
    if (result.status === "queued" && options.opportunistic !== false) {
      try {
        await this.executeQueued(result.runId, payload);
      } catch (error) {
        console.error("[AGENTCORE_QUEUE_DISPATCH_FAILED]", {
          runId: result.runId,
          errorName: error instanceof Error ? error.name : "UnknownError",
        });
      }
    }
    return result;
  }

  async executeQueued(
    runId: string,
    payload: AgentTask,
  ): Promise<AgentRunAccepted> {
    const request: ExecuteAgentRunRequest = {
      operation: "execute_run",
      runId,
      task: payload,
    };
    const response = (await this.invoke(request)) as Partial<AgentRunAccepted>;
    if (response.status !== "accepted" || response.runId !== runId) {
      throw new Error("AgentCore did not accept the queued run");
    }
    return { status: "accepted", runId };
  }
}

function createAgentCoreInvoker(
  runtimeArn: string,
  region: string,
): AgentCoreInvoke {
  const client = new AwsBedrockAgentCoreClient({ region });
  return (request) => invokeAgentCore(client, runtimeArn, request);
}

async function invokeAgentCore(
  client: AwsBedrockAgentCoreClient,
  runtimeArn: string,
  request: unknown,
): Promise<unknown> {
  const response = await client.send(
    new InvokeAgentRuntimeCommand({
      agentRuntimeArn: runtimeArn,
      runtimeSessionId: randomUUID(),
      contentType: "application/json",
      accept: "application/json, text/event-stream",
      payload: new TextEncoder().encode(JSON.stringify(request)),
    }),
  );
  if (!response.response)
    throw new Error("AgentCore returned an empty response");
  const body = await response.response.transformToString();
  return parseAgentCoreResponse(body, response.contentType);
}

export function getAgentClient(): AgentClient {
  const config = parseServerEnvironment();
  return config.agentRuntime === "agentcore"
    ? new AgentCoreClient(config.agentcoreRuntimeArn!, config.awsRegion!)
    : new LocalAgentClient();
}

export function parseAgentCoreResponse(
  body: string,
  contentType?: string,
): RunResult {
  if (!contentType?.includes("text/event-stream"))
    return JSON.parse(body) as RunResult;
  const data = body
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter(Boolean);
  if (data.length === 0) throw new Error("AgentCore returned empty SSE data");
  return JSON.parse(data.at(-1)!) as RunResult;
}
