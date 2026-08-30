import { runAgentTask } from "../run-task";
import type { AgentTask, RunResult } from "../task";
import { runtimeDeps } from "./deps";

export interface AgentClient {
  run(payload: AgentTask): Promise<RunResult>;
}

export class LocalAgentClient implements AgentClient {
  async run(payload: AgentTask): Promise<RunResult> {
    return runAgentTask(payload, await runtimeDeps(payload));
  }
}
