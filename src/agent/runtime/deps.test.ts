import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentTask } from "../task";

const mocks = vi.hoisted(() => ({
  clock: { now: () => new Date("2026-09-13T10:00:00Z") },
  clockLoad: vi.fn(),
  connection: { db: { database: "db" } },
  parseEnvironment: vi.fn(),
  scheduler: { schedule: vi.fn(), cancel: vi.fn() },
  schedulerForHome: vi.fn(),
  scriptedModel: { model: "scripted" },
  scriptedModelForTask: vi.fn(),
  sql: vi.fn(),
}));

vi.mock("@/core/clock", () => ({ DbDemoClock: { load: mocks.clockLoad } }));
vi.mock("@/core/db/client", () => ({
  getDatabaseConnection: () => mocks.connection,
  sqlClient: () => mocks.sql,
}));
vi.mock("@/lib/server/env", () => ({ parseServerEnvironment: mocks.parseEnvironment }));
vi.mock("../scheduler", () => ({ schedulerForHome: mocks.schedulerForHome }));
vi.mock("../scripted-model-selection", () => ({
  scriptedModelForTask: mocks.scriptedModelForTask,
}));

import { runtimeDeps } from "./deps";

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
    mocks.sql.mockResolvedValue([{ demo: true }]);
    mocks.clockLoad.mockResolvedValue(mocks.clock);
    mocks.schedulerForHome.mockReturnValue(mocks.scheduler);
    mocks.scriptedModelForTask.mockReturnValue(mocks.scriptedModel);
  });

  it("loads demo-aware dependencies and a scripted model", async () => {
    mocks.parseEnvironment.mockReturnValue({ appUrl: "https://app.example", model: "scripted" });

    const deps = await runtimeDeps(hostTask, { executionRuntime: "agentcore" });

    expect(deps).toMatchObject({
      db: mocks.connection.db,
      clock: mocks.clock,
      scheduler: mocks.scheduler,
      appUrl: "https://app.example",
      locale: "es",
      executionRuntime: "agentcore",
      model: mocks.scriptedModel,
    });
    expect(mocks.clockLoad).toHaveBeenCalledWith(hostTask.homeId, mocks.connection.db);
    expect(mocks.schedulerForHome).toHaveBeenCalledWith({ homeDemo: true });
    expect(mocks.scriptedModelForTask).toHaveBeenCalledWith(hostTask, deps);
  });

  it("falls back to English and omits the scripted model for Bedrock", async () => {
    mocks.parseEnvironment.mockReturnValue({ appUrl: "http://localhost:3008", model: "bedrock" });
    mocks.sql.mockResolvedValue([{ demo: false }]);
    const tick: AgentTask = {
      task: "tick",
      homeId: hostTask.homeId,
      jobId: "33333333-3333-4333-8333-333333333333",
    };

    const deps = await runtimeDeps(tick);

    expect(deps.locale).toBe("en");
    expect(deps.executionRuntime).toBe("local");
    expect(deps).not.toHaveProperty("model");
    expect(mocks.schedulerForHome).toHaveBeenCalledWith({ homeDemo: false });
  });

  it("rejects an unknown home", async () => {
    mocks.parseEnvironment.mockReturnValue({ appUrl: "http://localhost:3008", model: "scripted" });
    mocks.sql.mockResolvedValue([]);

    await expect(runtimeDeps(hostTask)).rejects.toThrow(`Home not found: ${hostTask.homeId}`);
    expect(mocks.clockLoad).not.toHaveBeenCalled();
  });
});
