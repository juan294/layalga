import { describe, expect, it, vi } from "vitest";

import type { DatabaseClient } from "@/core/db/client";
import type { MemoryClient, Page } from "./client";
import {
  deleteAllEvents,
  deleteAllMemoryRecords,
  forgetPartyMemory,
} from "./forget";

/** Pages two at a time with an offset token, which a deletion shifts. */
function offsetPage<T>(items: T[], nextToken?: string): Page<T> {
  const start = nextToken ? Number(nextToken) : 0;
  const end = start + 2;
  return {
    items: items.slice(start, end),
    nextToken: end < items.length ? String(end) : undefined,
  };
}

function shrinkingMemory() {
  const records = ["r1", "r2", "r3", "r4", "r5"];
  const sessions: Record<string, string[]> = {
    s1: ["e1", "e2", "e3"],
    s2: ["e4"],
    s3: ["e5", "e6"],
  };
  const liveSessions = () =>
    Object.keys(sessions).filter((id) => (sessions[id] ?? []).length > 0);
  const client: MemoryClient = {
    createEvent: vi.fn(),
    listMemoryRecords: vi.fn(async ({ nextToken }) =>
      offsetPage(
        records.map((memoryRecordId) => ({
          memoryRecordId,
          text: "fact",
          createdAt: new Date("2026-10-15T10:00:00Z"),
        })),
        nextToken,
      ),
    ),
    batchDeleteMemoryRecords: vi.fn(async ({ memoryRecordIds }) => {
      for (const id of memoryRecordIds) records.splice(records.indexOf(id), 1);
    }),
    listSessions: vi.fn(async ({ nextToken }) =>
      offsetPage(liveSessions(), nextToken),
    ),
    listEvents: vi.fn(async ({ sessionId, nextToken }) =>
      offsetPage(sessions[sessionId] ?? [], nextToken),
    ),
    deleteEvent: vi.fn(async ({ sessionId, eventId }) => {
      const events = sessions[sessionId] ?? [];
      events.splice(events.indexOf(eventId), 1);
    }),
  };
  return { client, records, sessions };
}

describe("shared forget helpers", () => {
  it("collects every record before deleting, so offset tokens skip nothing", async () => {
    const memory = shrinkingMemory();

    await expect(
      deleteAllMemoryRecords(memory.client, "memory-1", "/parties/actor-1"),
    ).resolves.toBe(5);
    expect(memory.records).toEqual([]);
    expect(memory.client.batchDeleteMemoryRecords).toHaveBeenCalledTimes(1);
  });

  it("collects every session's events before deleting, so offset tokens skip nothing", async () => {
    const memory = shrinkingMemory();

    await expect(
      deleteAllEvents(memory.client, "memory-1", "actor-1"),
    ).resolves.toBe(6);
    expect(memory.sessions).toEqual({ s1: [], s2: [], s3: [] });
  });

  it("counts the records a batch reports as deleted", async () => {
    const memory = shrinkingMemory();
    vi.mocked(memory.client.batchDeleteMemoryRecords).mockResolvedValue(3);

    await expect(
      deleteAllMemoryRecords(memory.client, "memory-1", "/parties/actor-1"),
    ).resolves.toBe(3);
  });
});

describe("forgetPartyMemory", () => {
  it("deletes paginated records and events, then audits the totals", async () => {
    const records = Array.from({ length: 101 }, (_, index) => ({
      memoryRecordId: `record-${index}`,
      text: `Fact ${index}`,
      createdAt: new Date("2026-09-13T10:00:00Z"),
    }));
    const client: MemoryClient = {
      createEvent: vi.fn(),
      listMemoryRecords: vi
        .fn()
        .mockResolvedValueOnce({ items: records, nextToken: "records-next" })
        .mockResolvedValueOnce({ items: [] }),
      batchDeleteMemoryRecords: vi.fn().mockResolvedValue(undefined),
      listSessions: vi
        .fn()
        .mockResolvedValueOnce({ items: ["session-1", "session-2"], nextToken: "sessions-next" })
        .mockResolvedValueOnce({ items: [] }),
      listEvents: vi
        .fn()
        .mockResolvedValueOnce({ items: ["event-1"], nextToken: "events-next" })
        .mockResolvedValueOnce({ items: ["event-2"] })
        .mockResolvedValueOnce({ items: [] }),
      deleteEvent: vi.fn().mockResolvedValue(undefined),
    };
    const database = vi.fn().mockResolvedValue([]) as unknown as DatabaseClient;

    await expect(
      forgetPartyMemory(
        database,
        "home-1",
        "party-1",
        "memory-1",
        "eu-west-1",
        client,
      ),
    ).resolves.toEqual({ deletedRecords: 101, deletedEvents: 2 });

    expect(client.listMemoryRecords).toHaveBeenCalledWith({
      memoryId: "memory-1",
      namespacePath: "/parties/home-home-1/party-party-1",
      nextToken: undefined,
    });
    // All 101 ids are collected first, then deleted as 100 + 1.
    expect(
      vi
        .mocked(client.batchDeleteMemoryRecords)
        .mock.calls.map(([input]) => input.memoryRecordIds.length),
    ).toEqual([100, 1]);
    expect(client.deleteEvent).toHaveBeenCalledWith({
      memoryId: "memory-1",
      actorId: "home-home-1/party-party-1",
      sessionId: "session-1",
      eventId: "event-1",
    });
    expect(database).toHaveBeenCalledTimes(1);
  });
});
