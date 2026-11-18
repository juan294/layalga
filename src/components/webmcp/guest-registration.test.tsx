import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  effects: [] as (() => void | (() => void))[],
  ref: { current: [] as unknown[] },
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useRef: () => mocks.ref,
  useEffect: (effect: () => void | (() => void)) => {
    mocks.effects.push(effect);
  },
}));

import {
  GuestWebMcpRegistration,
  prepareGuestBookingInDocument,
} from "./guest-registration";

describe("guest WebMCP registration", () => {
  beforeEach(() => {
    mocks.effects.length = 0;
    vi.unstubAllGlobals();
  });

  function registeredNames(options: unknown[]): string[] {
    const registerTool = vi.fn();
    vi.stubGlobal("document", { modelContext: { registerTool } });
    GuestWebMcpRegistration({ options: options as never });
    for (const effect of mocks.effects) effect();
    return registerTool.mock.calls.map(([tool]) => tool.name);
  }

  test("registers booking preparation only when room options are visible", () => {
    expect(registeredNames([])).not.toContain("layalga.guest.prepare_booking");
    mocks.effects.length = 0;
    const visible = [
      {
        stay: ["2026-09-18", "2026-09-20"],
        rooms: [{ id: "room-a", guestLabel: "Garden room" }],
        recommendedRoomIds: ["room-a"],
      },
    ];
    expect(registeredNames(visible)).toContain("layalga.guest.prepare_booking");
  });
});

describe("guest WebMCP component preparation", () => {
  test("fails with recovery guidance when the requested consent control is not visible", () => {
    const stay = checkbox("2026-09-18|2026-09-20");
    const roomA = checkbox("room-a");
    const form = {
      querySelector: (selector: string) =>
        selector.includes("stay-choice") ? stay : null,
      querySelectorAll: () => [roomA],
      scrollIntoView: vi.fn(),
    };

    expect(() =>
      prepareGuestBookingInDocument(
        { querySelector: () => form } as unknown as Document,
        { stay: stay.value, roomIds: ["room-a"], acceptOverflow: true },
      ),
    ).toThrow(/overflow consent.*not shown.*acceptOverflow to false/i);
    expect(form.scrollIntoView).not.toHaveBeenCalled();
  });

  test("maps acceptOverflow to the visible consent field without submitting", () => {
    const stay = checkbox("2026-09-18|2026-09-20");
    const roomA = checkbox("room-a");
    const roomB = checkbox("room-b");
    const overflowConsent = checkbox("on");
    const requestSubmit = vi.fn();
    const form = {
      querySelector: (selector: string) =>
        selector.includes("stay-choice") ? stay : overflowConsent,
      querySelectorAll: () => [roomA, roomB],
      requestSubmit,
      scrollIntoView: vi.fn(),
    };
    const target = { querySelector: () => form };

    prepareGuestBookingInDocument(target as unknown as Document, {
      stay: stay.value,
      roomIds: [roomA.value],
      acceptOverflow: true,
    });

    expect(stay.checked).toBe(true);
    expect(roomA.checked).toBe(true);
    expect(roomB.checked).toBe(false);
    expect(overflowConsent.checked).toBe(true);
    expect(requestSubmit).not.toHaveBeenCalled();
  });
});

interface FakeCheckbox {
  value: string;
  checked: boolean;
  click: () => void;
  focus: ReturnType<typeof vi.fn>;
}

function checkbox(value: string): FakeCheckbox {
  const result: FakeCheckbox = {
    value,
    checked: false,
    click: () => {
      result.checked = !result.checked;
    },
    focus: vi.fn(),
  };
  return result;
}
