import { describe, expect, test, vi } from "vitest";

import { prepareHostBlockInDocument } from "./host-registration";

describe("host WebMCP component preparation", () => {
  test("updates the visible form and never submits it", () => {
    const controls = new Map<string, FakeControl>([
      ["from", control()],
      ["to", control()],
      ["publicLabel", control()],
    ]);
    const roomA = control("room-a");
    const roomB = control("room-b");
    const requestSubmit = vi.fn();
    const form = {
      elements: { namedItem: (name: string) => controls.get(name) ?? null },
      querySelectorAll: () => [roomA, roomB],
      querySelector: () => controls.get("from"),
      requestSubmit,
      scrollIntoView: vi.fn(),
    };
    const target = { querySelector: () => form };

    prepareHostBlockInDocument(target as unknown as Document, {
      from: "2026-09-18",
      to: "2026-09-20",
      roomIds: ["room-b"],
      publicLabel: "Family room use",
    });

    expect(controls.get("from")?.value).toBe("2026-09-18");
    expect(controls.get("to")?.value).toBe("2026-09-20");
    expect(controls.get("publicLabel")?.value).toBe("Family room use");
    expect(roomA.checked).toBe(false);
    expect(roomB.checked).toBe(true);
    expect(requestSubmit).not.toHaveBeenCalled();
  });
});

interface FakeControl {
  value: string;
  checked: boolean;
  dispatchEvent: ReturnType<typeof vi.fn>;
  focus: ReturnType<typeof vi.fn>;
}

function control(value = ""): FakeControl {
  return {
    value,
    checked: false,
    dispatchEvent: vi.fn(),
    focus: vi.fn(),
  };
}
