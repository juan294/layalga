import { describe, expect, it, vi } from "vitest";

import type { DatabaseClient } from "@/core/db/client";
import type { MemoryClient } from "./client";
import { forgetPartyMemory } from "./forget";

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
    expect(client.batchDeleteMemoryRecords).toHaveBeenCalledTimes(2);
    expect(client.deleteEvent).toHaveBeenCalledWith({
      memoryId: "memory-1",
      actorId: "home-home-1/party-party-1",
      sessionId: "session-1",
      eventId: "event-1",
    });
    expect(database).toHaveBeenCalledTimes(1);
  });
});
