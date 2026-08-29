import {
  CreateScheduleCommand,
  DeleteScheduleCommand,
} from "@aws-sdk/client-scheduler";
import { describe, expect, it } from "vitest";

import {
  EventBridgeScheduler,
  NoopScheduler,
  schedulerForHome,
  type SchedulerCommandClient,
} from "./index";

const job = {
  id: "8d260160-b2b7-4dbd-aa67-6fd24ed24a90",
  homeId: "f3410b2d-586e-43cb-a460-ab34339d997b",
  kind: "reconfirm_chase" as const,
  dueAt: new Date("2026-09-15T07:00:00.123Z"),
};

describe("EventBridgeScheduler", () => {
  it("creates the documented one-shot AgentCore schedule", async () => {
    const commands: (CreateScheduleCommand | DeleteScheduleCommand)[] = [];
    const client: SchedulerCommandClient = {
      send: async (command) => {
        commands.push(command);
        return {};
      },
    };
    const scheduler = new EventBridgeScheduler({
      client,
      runtimeArn:
        "arn:aws:bedrock-agentcore:us-east-1:106403001709:runtime/example",
      roleArn: "arn:aws:iam::106403001709:role/layalga-scheduler-invoke",
      dlqArn: "arn:aws:sqs:us-east-1:106403001709:layalga-scheduler-dlq",
    });

    await expect(scheduler.schedule(job)).resolves.toBe(
      `layalga-reconfirm_chase-${job.id}`,
    );

    expect(commands).toHaveLength(1);
    const command = commands[0];
    expect(command).toBeInstanceOf(CreateScheduleCommand);
    if (!(command instanceof CreateScheduleCommand)) return;
    expect(command.input).toEqual({
      Name: `layalga-reconfirm_chase-${job.id}`,
      ScheduleExpression: "at(2026-09-15T07:00:00)",
      ScheduleExpressionTimezone: "UTC",
      FlexibleTimeWindow: { Mode: "OFF" },
      ActionAfterCompletion: "DELETE",
      Target: {
        Arn: "arn:aws:scheduler:::aws-sdk:bedrockagentcore:invokeAgentRuntime",
        RoleArn: "arn:aws:iam::106403001709:role/layalga-scheduler-invoke",
        Input: JSON.stringify({
          AgentRuntimeArn:
            "arn:aws:bedrock-agentcore:us-east-1:106403001709:runtime/example",
          Qualifier: "DEFAULT",
          ContentType: "application/json",
          Payload: JSON.stringify({
            task: "tick",
            homeId: job.homeId,
            jobId: job.id,
          }),
        }),
        RetryPolicy: { MaximumRetryAttempts: 2 },
        DeadLetterConfig: {
          Arn: "arn:aws:sqs:us-east-1:106403001709:layalga-scheduler-dlq",
        },
      },
    });
  });

  it("deletes a schedule by its external reference", async () => {
    const commands: (CreateScheduleCommand | DeleteScheduleCommand)[] = [];
    const scheduler = new EventBridgeScheduler({
      client: {
        send: async (command) => {
          commands.push(command);
          return {};
        },
      },
      runtimeArn: "runtime-arn",
      roleArn: "role-arn",
      dlqArn: "dlq-arn",
    });

    await scheduler.cancel(`layalga-reconfirm_chase-${job.id}`);

    expect(commands[0]).toBeInstanceOf(DeleteScheduleCommand);
    expect(commands[0]?.input).toEqual({
      Name: `layalga-reconfirm_chase-${job.id}`,
    });
  });

  it("treats create conflicts and missing deletes as completed retries", async () => {
    const scheduler = new EventBridgeScheduler({
      client: {
        send: async (command) => {
          throw {
            name:
              command instanceof CreateScheduleCommand
                ? "ConflictException"
                : "ResourceNotFoundException",
          };
        },
      },
      runtimeArn: "runtime-arn",
      roleArn: "role-arn",
      dlqArn: "dlq-arn",
    });

    await expect(scheduler.schedule(job)).resolves.toBe(
      `layalga-reconfirm_chase-${job.id}`,
    );
    await expect(scheduler.cancel("already-gone")).resolves.toBeUndefined();
  });
});

describe("schedulerForHome", () => {
  it("uses no external scheduler for demo homes", () => {
    expect(
      schedulerForHome({
        homeDemo: true,
        env: { SCHEDULER: "eventbridge" },
      }),
    ).toBeInstanceOf(NoopScheduler);
  });

  it("uses no external scheduler when scheduling is disabled", () => {
    expect(
      schedulerForHome({ homeDemo: false, env: { SCHEDULER: "none" } }),
    ).toBeInstanceOf(NoopScheduler);
  });
});
