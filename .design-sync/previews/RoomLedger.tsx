import { RoomLedger } from "layalga";

// Rooms, household and families are the demo seed's own (scripts/seed-demo.ts):
// Casa Ayalga, with Cuartu del Horreu / de la Fonte / del Teixu.

// The host page's own Host.rooms.* copy, resolved here the way the page
// resolves it through next-intl.
const LABELS = {
  doorStripLabel: "Room states for the selected month",
  inventoryTitle: "Room inventory",
  inventoryHelp:
    "Keep guest labels separate from internal names. Withheld rooms appear only when you open them for exact dates.",
  addRoom: "Add a room",
  privateBlockTitle: "Private room use",
  privateBlockHelp:
    "Take one or more rooms out of rotation without adding a guest booking.",
  roomsLabel: "Rooms",
  publicLabel: "Calendar-safe label",
  privateNote: "Private note",
  createBlock: "Block rooms",
  cancel: "Cancel",
  from: "From",
  to: "To",
  dateControlTitle: "Date controls",
  dateControlHelp:
    "Close an available room or open a withheld room for an exact date range.",
  room: "Room",
  chooseRoom: "Choose a room",
  action: "Action",
  close: "Close",
  open: "Open",
  saveControl: "Save date control",
  remove: "Remove",
  agentRequestTitle: "Ask the room coordinator",
  agentRequestHelp:
    "Describe the rooms and dates in plain language. The agent prepares a proposal for you to review here. It cannot apply the change.",
  agentRequestLabel: "Room request",
  agentRequestPlaceholder:
    "Block the garden room for family use from 2026-09-18 to 2026-09-20.",
  agentRequestSubmit: "Prepare proposal",
  proposalTitle: "Agent proposals",
  proposalHelp:
    "Agents can prepare these changes. Nothing changes until you apply one here.",
  apply: "Apply",
  dismiss: "Dismiss",
  noProposals: "No room proposals need review.",
  capacity: (standard: number, maximum: number) =>
    `Standard ${standard} · Maximum ${maximum}`,
  states: {
    available: "Available",
    occupied: "Occupied",
    private: "Private",
    closed: "Closed",
    withheld: "Withheld",
    inactive: "Inactive",
    draft: "Draft",
  },
  actions: {
    open: "Open",
    close: "Close",
    private_block: "Private block",
  },
  inventory: {
    internalName: "Internal name",
    guestLabel: "Guest label",
    floor: "Floor",
    sleepingArrangement: "Sleeping arrangement",
    standardCapacity: "Standard capacity",
    maximumCapacity: "Maximum capacity",
    inventoryState: "Inventory state",
    overflowPolicy: "Overflow policy",
    overflowArrangement: "Overflow arrangement",
    displayOrder: "Display order",
    privateNotes: "Private notes",
    none: "None",
    hostApproval: "Host approval",
    save: "Save room",
    create: "Create room",
  },
} as const;

const HORREU = {
  id: "00000000-0000-4000-8000-000000000101",
  name: "Horreu internal",
  guestLabel: "Cuartu del Horreu",
  floorLabel: "Upper floor",
  sleepingArrangement: "One double bed",
  overflowArrangement: "Folding bed on request",
  standardCapacity: 2,
  maximumCapacity: 3,
  inventoryState: "available" as const,
  overflowPolicy: "host_approval" as const,
  displayOrder: 1,
  privateNotes: null,
  doorState: "available" as const,
  doorStates: ["available" as const],
};

const FONTE = {
  id: "00000000-0000-4000-8000-000000000102",
  name: "Fonte internal",
  guestLabel: "Cuartu de la Fonte",
  floorLabel: "Ground floor",
  sleepingArrangement: "Two single beds",
  overflowArrangement: null,
  standardCapacity: 2,
  maximumCapacity: 2,
  inventoryState: "available" as const,
  overflowPolicy: "none" as const,
  displayOrder: 2,
  privateNotes: null,
  doorState: "occupied" as const,
  doorStates: ["occupied" as const],
};

const TEIXU = {
  id: "00000000-0000-4000-8000-000000000103",
  name: "Teixu internal",
  guestLabel: "Cuartu del Teixu",
  floorLabel: "Attic",
  sleepingArrangement: "Double air mattress",
  overflowArrangement: null,
  standardCapacity: 2,
  maximumCapacity: 2,
  inventoryState: "withheld" as const,
  overflowPolicy: "none" as const,
  displayOrder: 3,
  privateNotes: "Release only after host review.",
  doorState: "withheld" as const,
  doorStates: ["withheld" as const],
};

// The everyday state: three doors reading differently, and the control forms
// the host actually works in.
export function HouseInRotation() {
  return (
    <RoomLedger
      data={{
        rooms: [HORREU, FONTE, TEIXU],
        overrides: [],
        blocks: [],
        proposals: [],
        feeds: [],
      }}
      labels={LABELS}
      locale="en"
    />
  );
}

// Every list populated - a private block, a date control, an agent proposal
// awaiting review, and an issued calendar feed.
export function WithBlocksControlsAndProposals() {
  return (
    <RoomLedger
      data={{
        rooms: [HORREU, FONTE, TEIXU],
        overrides: [
          {
            id: "override-teixu",
            roomId: TEIXU.id,
            roomLabel: "Cuartu del Teixu",
            action: "open",
            start: "2026-09-18",
            end: "2026-09-20",
            privateNote: "Opened for the Vega family only.",
          },
        ],
        blocks: [
          {
            id: "block-fonte",
            start: "2026-09-25",
            end: "2026-09-27",
            publicLabel: "Family use",
            privateNote: "Grandparents visiting.",
            roomLabels: ["Cuartu de la Fonte"],
          },
        ],
        proposals: [
          {
            id: "proposal-horreu",
            kind: "private_block",
            start: "2026-10-02",
            end: "2026-10-04",
            summary: "Hold Cuartu del Horreu for family use",
            roomLabels: ["Cuartu del Horreu"],
          },
        ],
        feeds: [{ id: "feed-phone", label: "Nel's phone", locale: "en" }],
      }}
      labels={LABELS}
      locale="en"
    />
  );
}

// A brand-new household: the inventory is still a draft, so the strip carries
// the neutral unknown-state door rather than a closed one.
export function BeforeAnyRoomIsPublished() {
  return (
    <RoomLedger
      data={{
        rooms: [
          {
            ...HORREU,
            inventoryState: "draft",
            doorState: "draft",
            doorStates: ["draft"],
            overflowArrangement: null,
            overflowPolicy: "none",
          },
        ],
        overrides: [],
        blocks: [],
        proposals: [],
        feeds: [],
      }}
      labels={LABELS}
      locale="en"
    />
  );
}
