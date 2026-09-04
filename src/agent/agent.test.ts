import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import { FakeClock } from "@/core/clock";

import { buildAgent } from "./agent";
import { NoopScheduler } from "./deps";
import { ScriptedModel } from "./scripted-model";
import { RESUME_SYSTEM_PROMPT_SUFFIX } from "./system-prompt";

const url =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54622/postgres";
const sql = postgres(url, { prepare: false });

describe("buildAgent: resume names the deciding host's locale", () => {
  afterAll(() => sql.end());

  it("names English in the system prompt for an English-locale resume", () => {
    const agent = buildAgent({
      sessionId: "inv_agent-test-en",
      deps: {
        db: sql,
        clock: new FakeClock(new Date("2026-09-01T10:00:00Z")),
        scheduler: new NoopScheduler(),
        appUrl: "http://localhost:3008",
        locale: "en",
      },
      task: "resume",
      homeId: "10000000-0000-4000-8000-000000000001",
      model: new ScriptedModel([]),
    });

    expect(agent.systemPrompt).toContain(RESUME_SYSTEM_PROMPT_SUFFIX.en);
    expect(agent.systemPrompt).toContain("English");
    expect(agent.systemPrompt).not.toContain(RESUME_SYSTEM_PROMPT_SUFFIX.es);
  });

  it("names Spanish (español) in the system prompt for a Spanish-locale resume", () => {
    const agent = buildAgent({
      sessionId: "inv_agent-test-es",
      deps: {
        db: sql,
        clock: new FakeClock(new Date("2026-09-01T10:00:00Z")),
        scheduler: new NoopScheduler(),
        appUrl: "http://localhost:3008",
        locale: "es",
      },
      task: "resume",
      homeId: "10000000-0000-4000-8000-000000000001",
      model: new ScriptedModel([]),
    });

    expect(agent.systemPrompt).toContain(RESUME_SYSTEM_PROMPT_SUFFIX.es);
    expect(agent.systemPrompt).toContain("español");
    expect(agent.systemPrompt).not.toContain(RESUME_SYSTEM_PROMPT_SUFFIX.en);
  });

  it("leaves the system prompt unchanged for a non-resume task", () => {
    const agent = buildAgent({
      sessionId: "capture-agent-test",
      deps: {
        db: sql,
        clock: new FakeClock(new Date("2026-09-01T10:00:00Z")),
        scheduler: new NoopScheduler(),
        appUrl: "http://localhost:3008",
        locale: "en",
      },
      task: "host_capture",
      homeId: "10000000-0000-4000-8000-000000000001",
      model: new ScriptedModel([]),
    });

    expect(agent.systemPrompt).not.toContain(RESUME_SYSTEM_PROMPT_SUFFIX.en);
  });
});
