import { beforeEach, describe, expect, it, vi } from "vitest";

import { SystemClock } from "@/core/clock";

import type { AgentTask } from "../task";

const mocks = vi.hoisted(() => ({
  connection: { db: { database: "db" } },
  parseEnvironment: vi.fn(),
  scheduler: { schedule: vi.fn(), cancel: vi.fn() },
  configuredScheduler: vi.fn(),
  scriptedModel: { model: "scripted" },
  scriptedModelForTask: vi.fn(),
  sql: vi.fn(),
}));

vi.mock("@/core/db/client", () => ({
  getDatabaseConnection: () => mocks.connection,
  sqlClient: () => mocks.sql,
}));
vi.mock("@/lib/server/env", () => ({
  parseServerEnvironment: mocks.parseEnvironment,
}));
vi.mock("../scheduler", () => ({ configuredScheduler: mocks.configuredScheduler }));
vi.mock("../scripted-model-selection", () => ({
  scriptedModelForTask: mocks.scriptedModelForTask,
}));

import { runtimeDeps } from "./deps";
import { localRuntimeDeps } from "./local-deps";

const hostTask: AgentTask = {
  task: "host_capture",
  homeId: "11111111-1111-4111-8111-111111111111",
  hostId: "22222222-2222-4222-8222-222222222222",
  rawMessage: "Record a request.",
  locale: "es",
};

describe("runtimeDeps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sql.mockResolvedValue([{ id: hostTask.homeId }]);
    mocks.configuredScheduler.mockReturnValue(mocks.scheduler);
    mocks.scriptedModelForTask.mockReturnValue(mocks.scriptedModel);
  });

  it("uses the system clock and configured scheduler, and never the scripted model", async () => {
    mocks.parseEnvironment.mockReturnValue({
      appUrl: "https://app.example",
      model: "scripted",
    });

    const deps = await runtimeDeps(hostTask, { executionRuntime: "agentcore" });

    expect(deps).toMatchObject({
      db: mocks.connection.db,
      scheduler: mocks.scheduler,
      appUrl: "https://app.example",
      locale: "es",
      executionRuntime: "agentcore",
    });
    expect(deps.clock).toBeInstanceOf(SystemClock);
    expect(deps).not.toHaveProperty("model");
    expect(mocks.configuredScheduler).toHaveBeenCalledWith();
    expect(mocks.scriptedModelForTask).not.toHaveBeenCalled();
  });

  it("falls back to English for a task without a locale", async () => {
    mocks.parseEnvironment.mockReturnValue({
      appUrl: "http://localhost:3008",
      model: "bedrock",
    });
    const tick: AgentTask = {
      task: "tick",
      homeId: hostTask.homeId,
      jobId: "33333333-3333-4333-8333-333333333333",
    };

    const deps = await runtimeDeps(tick);

    expect(deps.locale).toBe("en");
    expect(deps.executionRuntime).toBe("local");
  });

  it("rejects an unknown home", async () => {
    mocks.parseEnvironment.mockReturnValue({
      appUrl: "http://localhost:3008",
      model: "scripted",
    });
    mocks.sql.mockResolvedValue([]);

    await expect(runtimeDeps(hostTask)).rejects.toThrow(
      `Home not found: ${hostTask.homeId}`,
    );
  });
});

describe("localRuntimeDeps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sql.mockResolvedValue([{ id: hostTask.homeId }]);
    mocks.configuredScheduler.mockReturnValue(mocks.scheduler);
    mocks.scriptedModelForTask.mockReturnValue(mocks.scriptedModel);
  });

  it("attaches the scripted model only when MODEL=scripted", async () => {
    mocks.parseEnvironment.mockReturnValue({
      appUrl: "http://localhost:3008",
      model: "scripted",
    });
    const deps = await localRuntimeDeps(hostTask);
    expect(deps.model).toBe(mocks.scriptedModel);
    expect(mocks.scriptedModelForTask).toHaveBeenCalledWith(hostTask, deps);

    mocks.parseEnvironment.mockReturnValue({
      appUrl: "http://localhost:3008",
      model: "bedrock",
    });
    expect(await localRuntimeDeps(hostTask)).not.toHaveProperty("model");
  });
});
