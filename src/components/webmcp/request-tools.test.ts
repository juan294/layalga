import { expect, it, vi } from "vitest";
import {
  createPrepareRequestTool,
  createReceiptStatusTool,
} from "./request-tools";

const room = {
  ref: "a".repeat(64),
  guestLabel: "Family room",
  floorLabel: "First",
  sleepingArrangement: "Beds",
  standardCapacity: 2,
  maximumCapacity: 4,
  overflowArrangement: "Sofa bed",
};
const stay: [string, string] = ["2090-07-01", "2090-07-15"];
const option = {
  stay,
  rooms: [room],
  recommendedRoomRefs: [room.ref],
  confirmation: "host_approval_required" as const,
};
const input = { from: stay[0], to: stay[1], roomRefs: [room.ref] };

it("prepares only dated visible room refs and leaves overflow consent to the guest", async () => {
  const reveal = vi.fn().mockReturnValue(true);
  const tool = createPrepareRequestTool([option], 3, reveal, async () => true);
  for (const rejected of [
    { ...input, to: "2090-07-16" },
    { ...input, roomRefs: ["b".repeat(64)] },
    { ...input, roomRefs: [room.ref, room.ref] },
    { ...input, overflowConsent: true },
  ]) {
    expect(await tool.execute(rejected)).toMatchObject({
      status: "invalid_selection",
    });
  }
  expect(reveal).not.toHaveBeenCalled();
  expect(await tool.execute(input)).toMatchObject({
    status: "prepared",
    requiresOverflowConsent: true,
  });
  expect(reveal).toHaveBeenCalledWith(stay, [room.ref]);
  reveal.mockReturnValue(false);
  expect(await tool.execute(input)).toMatchObject({
    status: "invalid_selection",
  });
});
it("rejects a selection that cannot fit the party before touching a form", async () => {
  const reveal = vi.fn();
  expect(
    await createPrepareRequestTool(
      [option],
      5,
      reveal,
      async () => true,
    ).execute(input),
  ).toMatchObject({ status: "invalid_selection" });
  expect(reveal).not.toHaveBeenCalled();
});
it("accepts no identifiers from the caller when reading the displayed receipt", async () => {
  const read = vi
    .fn()
    .mockResolvedValue({ status: "pending", visitStatus: null });
  const tool = createReceiptStatusTool(read);
  expect(await tool.execute({ requestId: "another" })).toMatchObject({
    status: "invalid",
  });
  expect(read).not.toHaveBeenCalled();
  expect(await tool.execute({})).toEqual({
    status: "pending",
    visitStatus: null,
  });
  read.mockRejectedValue(new Error("transport"));
  expect(await tool.execute({})).toMatchObject({ status: "unavailable" });
});

it("rechecks a session before acting on visible options after logout", async () => {
  const reveal = vi.fn();
  const session = vi.fn().mockResolvedValue(false);
  const tool = createPrepareRequestTool([option], 2, reveal, session);
  expect(await tool.execute(input)).toMatchObject({
    status: "sign_in",
    next: expect.stringMatching(/Google/),
  });
  session.mockRejectedValueOnce(new Error("transport"));
  expect(await tool.execute(input)).toMatchObject({ status: "unavailable" });
  expect(reveal).not.toHaveBeenCalled();
});
