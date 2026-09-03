import {
  ConflictException,
  CreateScheduleCommand,
  DeleteScheduleCommand,
  ResourceNotFoundException,
  SchedulerClient,
} from "@aws-sdk/client-scheduler";

import type {
  JobScheduler,
  ScheduledJobRequest,
} from "@/core/reconfirmation/jobs";
import { parseServerEnvironment } from "@/lib/server/env";

export type SchedulerJob = ScheduledJobRequest;
export type Scheduler = JobScheduler;

type SchedulerCommand = CreateScheduleCommand | DeleteScheduleCommand;

export interface SchedulerCommandClient {
  send(command: SchedulerCommand): Promise<unknown>;
}

type SchedulerEnvironment = Readonly<Record<string, string | undefined>>;

export interface EventBridgeSchedulerOptions {
  client?: SchedulerCommandClient;
  runtimeArn?: string;
  roleArn?: string;
  dlqArn?: string;
  region?: string;
}

export class EventBridgeScheduler implements Scheduler {
  private readonly client: SchedulerCommandClient;
  private readonly runtimeArn: string;
  private readonly roleArn: string;
  private readonly dlqArn: string;

  constructor(options: EventBridgeSchedulerOptions = {}) {
    this.client =
      options.client ??
      awsSchedulerClient(
        options.region ?? process.env.AWS_REGION ?? "us-east-1",
      );
    this.runtimeArn =
      options.runtimeArn ?? requiredEnv("AGENTCORE_RUNTIME_ARN");
    this.roleArn = options.roleArn ?? requiredEnv("SCHEDULER_ROLE_ARN");
    this.dlqArn = options.dlqArn ?? requiredEnv("SCHEDULER_DLQ_ARN");
  }

  async schedule(job: SchedulerJob): Promise<string> {
    const name = scheduleName(job);
    try {
      await this.client.send(
        new CreateScheduleCommand({
          Name: name,
          ScheduleExpression: `at(${utcScheduleTime(job.dueAt)})`,
          ScheduleExpressionTimezone: "UTC",
          FlexibleTimeWindow: { Mode: "OFF" },
          ActionAfterCompletion: "DELETE",
          Target: {
            Arn: "arn:aws:scheduler:::aws-sdk:bedrockagentcore:invokeAgentRuntime",
            RoleArn: this.roleArn,
            Input: JSON.stringify({
              AgentRuntimeArn: this.runtimeArn,
              Qualifier: "DEFAULT",
              ContentType: "application/json",
              Payload: JSON.stringify({
                operation: "scheduled_tick",
                homeId: job.homeId,
                jobId: job.id,
              }),
            }),
            RetryPolicy: { MaximumRetryAttempts: 2 },
            DeadLetterConfig: { Arn: this.dlqArn },
          },
        }),
      );
    } catch (error) {
      if (!isAwsError(error, ConflictException, "ConflictException"))
        throw error;
    }
    return name;
  }

  async cancel(ref: string): Promise<void> {
    try {
      await this.client.send(new DeleteScheduleCommand({ Name: ref }));
    } catch (error) {
      if (
        !isAwsError(
          error,
          ResourceNotFoundException,
          "ResourceNotFoundException",
        )
      ) {
        throw error;
      }
    }
  }
}

function awsSchedulerClient(region: string): SchedulerCommandClient {
  const client = new SchedulerClient({ region });
  return {
    send: (command) =>
      command instanceof CreateScheduleCommand
        ? client.send(command)
        : client.send(command),
  };
}

export class NoopScheduler implements Scheduler {
  async schedule(): Promise<null> {
    return null;
  }

  async cancel(): Promise<void> {}
}

export function schedulerForHome({
  homeDemo,
  env = process.env,
}: {
  homeDemo: boolean;
  env?: SchedulerEnvironment;
}): Scheduler {
  if (homeDemo) return new NoopScheduler();
  const config = parseServerEnvironment(env);
  if (config.scheduler === "none") {
    return new NoopScheduler();
  }
  return new EventBridgeScheduler({
    runtimeArn: config.agentcoreRuntimeArn!,
    roleArn: config.schedulerRoleArn!,
    dlqArn: config.schedulerDlqArn!,
    region: config.awsRegion!,
  });
}

function scheduleName(job: SchedulerJob): string {
  return `layalga-${job.kind}-${job.id}`;
}

function utcScheduleTime(dueAt: Date): string {
  if (!Number.isFinite(dueAt.getTime())) {
    throw new RangeError("Scheduled job dueAt must be a valid Date");
  }
  return dueAt.toISOString().replace(/\.\d{3}Z$/, "");
}

function requiredEnv(
  name: "AGENTCORE_RUNTIME_ARN" | "SCHEDULER_ROLE_ARN" | "SCHEDULER_DLQ_ARN",
  env: SchedulerEnvironment = process.env,
): string {
  const value = env[name];
  if (!value) throw new Error(`${name} is required for EventBridge scheduling`);
  return value;
}

function isAwsError(
  error: unknown,
  errorClass: abstract new (...args: never[]) => Error,
  name: string,
): boolean {
  return (
    error instanceof errorClass ||
    (typeof error === "object" &&
      error !== null &&
      "name" in error &&
      error.name === name)
  );
}
