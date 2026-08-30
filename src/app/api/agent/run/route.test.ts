import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enqueueAgentTask: vi.fn(),
  runtimeDeps: vi.fn(),
}));

vi.mock("@/agent/queue", () => ({
  enqueueAgentTask: mocks.enqueueAgentTask,
}));
vi.mock("@/agent/runtime/deps", () => ({ runtimeDeps: mocks.runtimeDeps }));

import { POST } from "./route";

describe("internal agent run route", () => {
  const agentSecret = "a".repeat(32);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("AGENT_ROUTE_SECRET", agentSecret);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns a stable error for malformed JSON", async () => {
    const response = await POST(
      new Request("https://example.test/api/agent/run", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-layalga-internal": agentSecret,
        },
        body: "not-json",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_JSON" },
      requestId: expect.any(String),
    });
  });

  it("does not expose internal failure details", async () => {
    mocks.runtimeDeps.mockRejectedValueOnce(
      new Error("postgresql://user:password@example.test/private"),
    );
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const response = await POST(
      new Request("https://example.test/api/agent/run", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-layalga-internal": agentSecret,
        },
        body: JSON.stringify({
          task: "host_capture",
          homeId: "00000000-0000-4000-8000-000000000001",
          hostId: "00000000-0000-4000-8000-000000000002",
          rawMessage: "private invitation text",
          locale: "en",
        }),
      }),
    );

    expect(response.status).toBe(500);
    const body = JSON.stringify(await response.json());
    expect(body).toContain("AGENT_RUN_FAILED");
    expect(body).not.toContain("password");
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("password");
  });
});
