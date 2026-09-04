import { randomUUID } from "node:crypto";

import {
  InMemorySpanExporter,
  NodeTracerProvider,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-node";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { FakeClock } from "@/core/clock";

import { NoopScheduler } from "./deps";
import { runAgentTask } from "./run-task";
import { ScriptedModel } from "./scripted-model";
import { cleanupHost, seedHost } from "./testing/seed-host";

// Proves Strands emits OTel spans under a globally registered tracer
// provider on its own -- independent of ADOT, which only activates that
// provider in the deployed AgentCore runtime (see deploy-agentcore.sh).
// The provider here must be registered before buildAgent constructs the
// Strands Agent, because Agent reads the tracer once, from the global API,
// at construction time.

const url =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54622/postgres";
const sql = postgres(url, { prepare: false });

describe("agent telemetry", () => {
  const exporter = new InMemorySpanExporter();
  const provider = new NodeTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });

  beforeAll(() => {
    provider.register();
  });

  afterEach(() => {
    exporter.reset();
  });

  afterAll(async () => {
    await provider.shutdown();
    await sql.end();
  });

  it("emits invoke_agent and execute_tool spans for a scripted host_capture run", async () => {
    const fixture = await seedHost(sql, `Telemetry ${randomUUID()}`);
    const rawMessage = "Invite the Vega family next weekend.";
    const model = new ScriptedModel([
      {
        toolUse: {
          name: "capture_invitation",
          input: {
            partyName: "Familia Vega",
            partyLocale: "en",
            adults: 2,
            children: 2,
            pets: 0,
            flexibleDates: { text: rawMessage },
            specialRequests: [],
            rawMessage,
          },
        },
      },
      { text: "Invitation recorded." },
    ]);
    try {
      const result = await runAgentTask(
        hostTask(fixture, rawMessage),
        deps(model),
      );
      expect(result).toMatchObject({ status: "completed" });

      const spans = exporter.getFinishedSpans();

      // Strands 1.16 names the agent span `invoke_agent <agent name>`; the
      // default agent name is "Strands Agent" (buildAgent does not set one).
      const invokeAgentSpan = spans.find((span) =>
        span.name.startsWith("invoke_agent"),
      );
      expect(invokeAgentSpan).toBeDefined();
      expect(invokeAgentSpan?.attributes["layalga.home_id"]).toBe(
        fixture.homeId,
      );
      expect(invokeAgentSpan?.attributes["layalga.task"]).toBe("host_capture");
      expect(invokeAgentSpan?.attributes["session.id"]).toBeTypeOf("string");

      // Strands 1.16 names the tool span `execute_tool <tool name>` and
      // sets `gen_ai.tool.name` to the tool name.
      const executeToolSpan = spans.find((span) =>
        span.name.startsWith("execute_tool"),
      );
      expect(executeToolSpan).toBeDefined();
      expect(executeToolSpan?.attributes["gen_ai.tool.name"]).toBe(
        "capture_invitation",
      );
    } finally {
      await cleanupHost(sql, fixture);
    }
  });
});

function deps(model: ScriptedModel) {
  return {
    db: sql,
    clock: new FakeClock(new Date("2026-09-01T10:00:00Z")),
    scheduler: new NoopScheduler(),
    appUrl: "http://localhost:3008",
    locale: "en" as const,
    model,
  };
}

function hostTask(
  fixture: Awaited<ReturnType<typeof seedHost>>,
  rawMessage: string,
) {
  return {
    task: "host_capture" as const,
    homeId: fixture.homeId,
    hostId: fixture.hostId,
    rawMessage,
    locale: "en" as const,
  };
}
