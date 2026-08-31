import { readFile } from "node:fs/promises";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

vi.mock("next-intl/server", () => ({
  getTranslations:
    async () => (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${JSON.stringify(values)}` : key,
}));
vi.mock("@/app/[locale]/(host)/room-actions", () => ({
  applyRoomProposalAction: vi.fn(),
  cancelPrivateBlockAction: vi.fn(),
  createPrivateBlockAction: vi.fn(),
  createRoomInventoryAction: vi.fn(),
  createRoomOverrideAction: vi.fn(),
  dismissRoomProposalAction: vi.fn(),
  removeRoomOverrideAction: vi.fn(),
  requestRoomProposalAction: vi.fn(),
  updateRoomInventoryAction: vi.fn(),
}));
vi.mock("./calendar-feed-controls", () => ({
  CalendarFeedControls: () => <div data-testid="feed-controls" />,
}));

import { RoomLedger } from "./room-ledger";

describe("host room ledger", () => {
  test("renders plan-like doors with text states and host-private details", async () => {
    const element = await RoomLedger({
      locale: "en",
      data: {
        rooms: [
          {
            id: "00000000-0000-4000-8000-000000000001",
            name: "Office internal",
            guestLabel: "Study room",
            floorLabel: "Upper floor",
            sleepingArrangement: "Double air mattress",
            overflowArrangement: null,
            standardCapacity: 2,
            maximumCapacity: 2,
            inventoryState: "withheld",
            overflowPolicy: "none",
            displayOrder: 4,
            privateNotes: "Release only after host review",
            doorState: "withheld",
            doorStates: ["withheld"],
          },
        ],
        overrides: [],
        blocks: [],
        proposals: [],
        feeds: [],
      },
    });
    const html = renderToStaticMarkup(element);
    expect(html).toContain('data-door-state="withheld"');
    expect(html).toContain("Study room");
    expect(html).toContain("Release only after host review");
    expect(html).toContain("states.withheld");
  });

  test("keeps every room mutation behind host authentication and revalidation", async () => {
    const source = await readFile(
      new URL("../../app/[locale]/(host)/room-actions.ts", import.meta.url),
      "utf8",
    );
    expect(source.match(/requireHost\(/g)?.length).toBeGreaterThanOrEqual(8);
    expect(source).toContain("revalidatePath(`/${locale}`)");
    expect(source).not.toContain("homeId: String(formData");
  });
});
