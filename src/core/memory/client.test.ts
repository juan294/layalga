import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock("@aws-sdk/client-bedrock-agentcore", () => {
  class FakeClient {
    send = mocks.send;
  }
  class FakeCommand {
    constructor(public readonly input: Record<string, unknown>) {}
  }
  return {
    BatchDeleteMemoryRecordsCommand: FakeCommand,
    BedrockAgentCoreClient: FakeClient,
    CreateEventCommand: FakeCommand,
    DeleteEventCommand: FakeCommand,
    ListActorsCommand: FakeCommand,
    ListEventsCommand: FakeCommand,
    ListMemoryRecordsCommand: FakeCommand,
    ListSessionsCommand: FakeCommand,
  };
});

import { createMemoryClient } from "./client";

beforeEach(() => mocks.send.mockReset());

describe("AgentCore memory client adapter", () => {
  it("creates a user event with the caller's idempotency key", async () => {
    mocks.send.mockResolvedValue({});
    const client = createMemoryClient("us-east-1");

    await client.createEvent({
      memoryId: "memory-1",
      actorId: "actor-1",
      sessionId: "session-1",
      eventTimestamp: new Date("2026-09-10T10:00:00.000Z"),
      text: "Prefers the ground floor.",
      clientToken: "run-1",
    });

    expect(mocks.send.mock.calls[0]?.[0].input).toEqual({
      memoryId: "memory-1",
      actorId: "actor-1",
      sessionId: "session-1",
      eventTimestamp: new Date("2026-09-10T10:00:00.000Z"),
      payload: [
        {
          conversational: {
            content: { text: "Prefers the ground floor." },
            role: "USER",
          },
        },
      ],
      clientToken: "run-1",
    });
  });

  it("maps record pages, including missing content and timestamps", async () => {
    mocks.send.mockResolvedValueOnce({
      memoryRecordSummaries: [
        {
          memoryRecordId: "record-1",
          content: { text: "Ground floor" },
          createdAt: new Date("2026-09-10T10:00:00.000Z"),
          namespaces: ["/parties/actor-1/preferences"],
        },
        { memoryRecordId: undefined, content: { binary: "ignored" } },
      ],
      nextToken: "next",
    });
    const page = await createMemoryClient("us-east-1").listMemoryRecords({
      memoryId: "memory-1",
      namespacePath: "/parties/actor-1",
    });

    expect(page).toEqual({
      items: [
        {
          memoryRecordId: "record-1",
          text: "Ground floor",
          createdAt: new Date("2026-09-10T10:00:00.000Z"),
          namespaces: ["/parties/actor-1/preferences"],
        },
        {
          memoryRecordId: "",
          text: "",
          createdAt: new Date(0),
          namespaces: [],
        },
      ],
      nextToken: "next",
    });
  });

  it("skips empty deletion batches and sends non-empty records", async () => {
    mocks.send.mockResolvedValue({});
    const client = createMemoryClient("us-east-1");
    await client.batchDeleteMemoryRecords({ memoryId: "memory-1", memoryRecordIds: [] });
    expect(mocks.send).not.toHaveBeenCalled();

    await client.batchDeleteMemoryRecords({
      memoryId: "memory-1",
      memoryRecordIds: ["record-1", "record-2"],
    });
    expect(mocks.send.mock.calls[0]?.[0].input).toEqual({
      memoryId: "memory-1",
      records: [{ memoryRecordId: "record-1" }, { memoryRecordId: "record-2" }],
    });
  });

  it("throws with only the failure count when a batch partly fails", async () => {
    mocks.send.mockResolvedValueOnce({
      successfulRecords: [{ memoryRecordId: "record-1", status: "SUCCEEDED" }],
      failedRecords: [
        {
          memoryRecordId: "record-secret-2",
          status: "FAILED",
          errorCode: 500,
          errorMessage: "Prefers the ground floor",
        },
      ],
    });

    const error = await createMemoryClient("us-east-1")
      .batchDeleteMemoryRecords({
        memoryId: "memory-1",
        memoryRecordIds: ["record-1", "record-secret-2"],
      })
      .then(
        () => undefined,
        (reason: unknown) => reason,
      );

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(
      "BatchDeleteMemoryRecords failed for 1 of 2 record(s)",
    );
  });

  it("filters anonymous session and event summaries and deletes one event", async () => {
    mocks.send
      .mockResolvedValueOnce({
        sessionSummaries: [{ sessionId: "session-1" }, {}, { sessionId: "" }],
        nextToken: "sessions-next",
      })
      .mockResolvedValueOnce({
        events: [{ eventId: "event-1" }, {}, { eventId: "" }],
        nextToken: "events-next",
      })
      .mockResolvedValueOnce({});
    const client = createMemoryClient("us-east-1");

    await expect(
      client.listSessions({ memoryId: "memory-1", actorId: "actor-1" }),
    ).resolves.toEqual({ items: ["session-1"], nextToken: "sessions-next" });
    await expect(
      client.listEvents({
        memoryId: "memory-1",
        actorId: "actor-1",
        sessionId: "session-1",
      }),
    ).resolves.toEqual({ items: ["event-1"], nextToken: "events-next" });
    await client.deleteEvent({
      memoryId: "memory-1",
      actorId: "actor-1",
      sessionId: "session-1",
      eventId: "event-1",
    });
    expect(mocks.send.mock.calls[2]?.[0].input).toEqual({
      memoryId: "memory-1",
      sessionId: "session-1",
      eventId: "event-1",
      actorId: "actor-1",
    });
  });

  it("lists actor ids page by page, dropping anonymous summaries", async () => {
    mocks.send.mockResolvedValueOnce({
      actorSummaries: [{ actorId: "actor-1" }, {}, { actorId: "" }],
      nextToken: "actors-next",
    });

    await expect(
      createMemoryClient("us-east-1").listActors({
        memoryId: "memory-1",
        nextToken: "actors-previous",
      }),
    ).resolves.toEqual({ items: ["actor-1"], nextToken: "actors-next" });
    expect(mocks.send.mock.calls[0]?.[0].input).toEqual({
      memoryId: "memory-1",
      nextToken: "actors-previous",
      maxResults: 100,
    });
  });
});
