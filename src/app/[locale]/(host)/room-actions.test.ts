import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  reportActionError: vi.fn(),
  requireHost: vi.fn(),
  updateRoomInventory: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/current-host", () => ({ requireHost: mocks.requireHost }));
vi.mock("@/lib/server/action-errors", () => ({
  reportActionError: mocks.reportActionError,
}));
vi.mock("@/core/db/client", () => ({
  getDatabaseConnection: () => ({ db: { kind: "test-db" } }),
}));
vi.mock("@/core/rooms/operations", () => ({
  applyRoomActionProposal: vi.fn(),
  cancelPrivateRoomBlock: vi.fn(),
  createPrivateRoomBlock: vi.fn(),
  createRoomAvailabilityOverride: vi.fn(),
  createRoomInventory: vi.fn(),
  dismissRoomActionProposal: vi.fn(),
  removeRoomAvailabilityOverride: vi.fn(),
  updateRoomInventory: mocks.updateRoomInventory,
}));

import { updateRoomInventoryAction } from "./room-actions";

const host = {
  id: "00000000-0000-4000-8000-000000000001",
  homeId: "00000000-0000-4000-8000-000000000002",
};
const roomId = "00000000-0000-4000-8000-000000000003";

function inventoryForm() {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    locale: "en",
    roomId,
    name: "Internal room",
    guestLabel: "Garden room",
    floorLabel: "Ground floor",
    sleepingArrangement: "Double bed",
    standardCapacity: "2",
    maximumCapacity: "2",
    inventoryState: "available",
    overflowPolicy: "none",
    displayOrder: "1",
  })) {
    form.set(key, value);
  }
  return form;
}

describe("host room actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireHost.mockResolvedValue(host);
    mocks.updateRoomInventory.mockResolvedValue(undefined);
  });

  test("reauthenticates and derives home authority for every request", async () => {
    await updateRoomInventoryAction(inventoryForm());
    expect(mocks.requireHost).toHaveBeenCalledWith("en");
    expect(mocks.updateRoomInventory).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        homeId: host.homeId,
        hostId: host.id,
        roomId,
      }),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/en");

    mocks.updateRoomInventory.mockRejectedValueOnce(
      new Error("stale or cross-home room"),
    );
    await updateRoomInventoryAction(inventoryForm());
    expect(mocks.requireHost).toHaveBeenCalledTimes(2);
    expect(mocks.reportActionError).toHaveBeenCalledWith(
      "room_inventory_update_failed",
      expect.any(Error),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(1);
  });
});
