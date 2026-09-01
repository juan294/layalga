import { readFile } from "node:fs/promises";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

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

import { RoomLedger, type RoomLedgerLabels } from "./room-ledger";

/* Every label echoes its message key, so an assertion on "states.withheld"
   still proves that the withheld door state reached the markup - the same
   thing the previous translator mock proved, now through the props. */
const LABELS: RoomLedgerLabels = {
  doorStripLabel: "doorStripLabel",
  inventoryTitle: "inventoryTitle",
  inventoryHelp: "inventoryHelp",
  addRoom: "addRoom",
  privateBlockTitle: "privateBlockTitle",
  privateBlockHelp: "privateBlockHelp",
  roomsLabel: "roomsLabel",
  publicLabel: "publicLabel",
  privateNote: "privateNote",
  createBlock: "createBlock",
  cancel: "cancel",
  from: "from",
  to: "to",
  dateControlTitle: "dateControlTitle",
  dateControlHelp: "dateControlHelp",
  room: "room",
  chooseRoom: "chooseRoom",
  action: "action",
  close: "close",
  open: "open",
  saveControl: "saveControl",
  remove: "remove",
  agentRequestTitle: "agentRequestTitle",
  agentRequestHelp: "agentRequestHelp",
  agentRequestLabel: "agentRequestLabel",
  agentRequestPlaceholder: "agentRequestPlaceholder",
  agentRequestSubmit: "agentRequestSubmit",
  proposalTitle: "proposalTitle",
  proposalHelp: "proposalHelp",
  apply: "apply",
  dismiss: "dismiss",
  noProposals: "noProposals",
  capacity: (standard, maximum) => `capacity:${standard}:${maximum}`,
  states: {
    available: "states.available",
    occupied: "states.occupied",
    private: "states.private",
    closed: "states.closed",
    withheld: "states.withheld",
    inactive: "states.inactive",
    draft: "states.draft",
  },
  actions: {
    open: "open",
    close: "close",
    private_block: "private_block",
  },
  inventory: {
    internalName: "internalName",
    guestLabel: "guestLabel",
    floor: "floor",
    sleepingArrangement: "sleepingArrangement",
    standardCapacity: "standardCapacity",
    maximumCapacity: "maximumCapacity",
    inventoryState: "inventoryState",
    overflowPolicy: "overflowPolicy",
    overflowArrangement: "overflowArrangement",
    displayOrder: "displayOrder",
    privateNotes: "privateNotes",
    none: "none",
    hostApproval: "hostApproval",
    save: "save",
    create: "create",
  },
};

describe("host room ledger", () => {
  test("renders plan-like doors with text states and host-private details", async () => {
    const element = RoomLedger({
      labels: LABELS,
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
