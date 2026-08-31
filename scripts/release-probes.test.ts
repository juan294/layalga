import { describe, expect, it, vi } from "vitest";

import type { RunResult } from "../src/agent/task";
import {
  assertRoomCoordinationProof,
  drainAndCollectTerminalRunResults,
  queuedRunIds,
} from "./release-probes";
import { DEMO_SEED } from "./seed-demo";

const firstRunId = "11111111-1111-4111-8111-111111111111";
const secondRunId = "22222222-2222-4222-8222-222222222222";

describe("durable release probe runs", () => {
  it("requires queued acknowledgements with distinct run IDs", () => {
    expect(
      queuedRunIds([queuedResult(firstRunId), queuedResult(secondRunId)]),
    ).toEqual([firstRunId, secondRunId]);
    expect(() =>
      queuedRunIds([
        { ...queuedResult(firstRunId), status: "completed" },
        queuedResult(secondRunId),
      ]),
    ).toThrow(/queued acknowledgement/i);
    expect(() =>
      queuedRunIds([queuedResult(firstRunId), queuedResult(firstRunId)]),
    ).toThrow(/distinct run ids/i);
  });

  it("drains once and polls the exact queued runs to terminal results", async () => {
    const drain = vi.fn(async () => undefined);
    const load = vi
      .fn()
      .mockResolvedValueOnce([
        { id: firstRunId, status: "running", result: null },
        { id: secondRunId, status: "queued", result: null },
      ])
      .mockResolvedValueOnce([
        terminalRow(firstRunId, "completed", "Visit confirmed"),
        terminalRow(secondRunId, "completed", "No free beds"),
      ]);

    await expect(
      drainAndCollectTerminalRunResults(
        [firstRunId, secondRunId],
        drain,
        load,
        { attempts: 2, intervalMs: 0 },
      ),
    ).resolves.toEqual([
      {
        runId: firstRunId,
        status: "completed",
        summary: "Visit confirmed",
      },
      {
        runId: secondRunId,
        status: "completed",
        summary: "No free beds",
      },
    ]);
    expect(drain).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledTimes(2);
    expect(load).toHaveBeenNthCalledWith(1, [firstRunId, secondRunId]);
  });

  it("requires complete, fixture-bound room coordination evidence", () => {
    const proof = {
      proposalCreated: true,
      privateBlockApplied: true,
      blockedRoomHidden: true,
      withheldRoomOpened: true,
      selectedRoomIds: [DEMO_SEED.rooms[0].id, DEMO_SEED.rooms[1].id],
      overflowInterrupted: true,
      overflowApproved: true,
      overflowAppliedOnce: true,
      calendarFeedRead: true,
      calendarPrivateDataAbsent: true,
      calendarEventCount: 3,
    };

    expect(() => assertRoomCoordinationProof(proof)).not.toThrow();
    expect(() =>
      assertRoomCoordinationProof({ ...proof, overflowAppliedOnce: false }),
    ).toThrow(/overflowAppliedOnce/);
    expect(() =>
      assertRoomCoordinationProof({
        ...proof,
        selectedRoomIds: [DEMO_SEED.rooms[1].id, DEMO_SEED.rooms[2].id],
      }),
    ).toThrow(/selected room ids/i);
    expect(() =>
      assertRoomCoordinationProof({ ...proof, calendarEventCount: 0 }),
    ).toThrow(/calendar event/i);
  });
});

function queuedResult(runId: string): RunResult {
  return {
    runId,
    status: "queued",
    sessionId: `session-${runId}`,
    pendingDecisionIds: [],
    summary: "Queued",
  };
}

function terminalRow(runId: string, status: "completed", summary: string) {
  return {
    id: runId,
    status,
    result: { summary },
  };
}
