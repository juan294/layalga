import { describe, expect, test, vi } from "vitest";

import { createGuestWebMcpTools } from "./guest-tools";
import { createHostWebMcpTools } from "./host-tools";
import { registerWebMcpTools } from "./register-tools";

describe("WebMCP preparation boundary", () => {
  test("no-ops without document.modelContext and aborts registrations on cleanup", () => {
    expect(registerWebMcpTools({}, [])).toBeTypeOf("function");

    const signals: AbortSignal[] = [];
    const modelContext = {
      registerTool: vi.fn(
        async (_tool: unknown, options?: { signal?: AbortSignal }) => {
          if (options?.signal) signals.push(options.signal);
        },
      ),
    };
    const cleanup = registerWebMcpTools(
      { modelContext },
      createHostWebMcpTools({
        rooms: [],
        prepareBlock: vi.fn(),
        prepareControl: vi.fn(),
      }),
    );
    expect(modelContext.registerTool).toHaveBeenCalledTimes(3);
    cleanup();
    expect(signals).toHaveLength(3);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });

  test("keeps registering and returns cleanup after a synchronous failure", () => {
    const signals: AbortSignal[] = [];
    const registerTool = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error("unsupported tool");
      })
      .mockImplementation(
        (_tool: unknown, options?: { signal?: AbortSignal }) => {
          if (options?.signal) signals.push(options.signal);
        },
      );
    const cleanup = registerWebMcpTools(
      { modelContext: { registerTool } },
      createHostWebMcpTools({
        rooms: [],
        prepareBlock: vi.fn(),
        prepareControl: vi.fn(),
      }),
    );

    expect(registerTool).toHaveBeenCalledTimes(3);
    cleanup();
    expect(signals).toHaveLength(2);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });

  test("uses narrow schemas without page authority", () => {
    const tools = [
      ...createHostWebMcpTools({
        rooms: [],
        prepareBlock: vi.fn(),
        prepareControl: vi.fn(),
      }),
      ...createGuestWebMcpTools({
        options: [],
        prepareSearch: vi.fn(),
        prepareBooking: vi.fn(),
      }),
    ];
    const schemas = JSON.stringify(tools.map((tool) => tool.inputSchema));
    expect(schemas).not.toMatch(/homeId|hostId|invitation|token|database/i);
    expect(
      tools.every((tool) => tool.inputSchema.additionalProperties === false),
    ).toBe(true);
  });

  test("bounds read output and marks database text read-only and untrusted", async () => {
    const rooms = Array.from({ length: 30 }, (_, index) => ({
      id: `room-${index}`,
      guestLabel: `Room ${index}`,
      floorLabel: "Floor",
      sleepingArrangement: "Bed",
      standardCapacity: 2,
      maximumCapacity: 2,
      state: "available",
    }));
    const [read] = createHostWebMcpTools({
      rooms,
      prepareBlock: vi.fn(),
      prepareControl: vi.fn(),
    });
    const result = (await read.execute({})) as { rooms: unknown[] };
    expect(result.rooms).toHaveLength(20);
    expect(read.annotations).toEqual({
      readOnlyHint: true,
      untrustedContentHint: true,
    });
  });

  test("preparation calls visible-state callbacks and performs no write", async () => {
    const prepareBooking = vi.fn();
    const tools = createGuestWebMcpTools({
      options: [
        {
          stay: ["2026-09-18", "2026-09-20"],
          rooms: [{ id: "room-1", guestLabel: "Garden room" }],
          recommendedRoomIds: ["room-1"],
        },
      ],
      prepareSearch: vi.fn(),
      prepareBooking,
    });
    const prepared = tools.find((tool) =>
      tool.name.endsWith("prepare_booking"),
    )!;
    const result = await prepared.execute({
      stay: "2026-09-18|2026-09-20",
      roomIds: ["room-1"],
      acceptOverflow: false,
    });
    expect(prepareBooking).toHaveBeenCalledWith({
      stay: "2026-09-18|2026-09-20",
      roomIds: ["room-1"],
      acceptOverflow: false,
    });
    expect(result).toMatchObject({ prepared: true, submitted: false });
  });

  test("rejects calendar dates that do not exist", async () => {
    const tools = createGuestWebMcpTools({
      options: [],
      prepareSearch: vi.fn(),
      prepareBooking: vi.fn(),
    });
    const prepareSearch = tools.find((tool) =>
      tool.name.endsWith("prepare_search"),
    )!;
    await expect(
      prepareSearch.execute({
        from: "2026-02-31",
        to: "2026-03-03",
        nights: 2,
        adults: 2,
        children: 0,
        pets: 0,
      }),
    ).rejects.toThrow("Invalid date");
  });
});
