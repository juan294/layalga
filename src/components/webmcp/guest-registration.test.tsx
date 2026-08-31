import { describe, expect, test, vi } from "vitest";

import { prepareGuestBookingInDocument } from "./guest-registration";

describe("guest WebMCP component preparation", () => {
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
