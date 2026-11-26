import { ProtocolError } from "@modelcontextprotocol/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { emptySchema } from "@/components/webmcp/contract";
import {
  findHouseholdsSchema,
  searchStaysSchema,
} from "@/core/booking/guest-lookup-schema";
import type { PublicStayOption } from "@/core/booking/public-stay-search";

import { TOOLS, callTool, type ToolContext, type ToolLookups } from "./tools";

const APP = "https://layalga.example";
const HANDLE = "d5e0b5a2-5155-4f81-9ab4-05ab2630582f";
const guest: ToolContext = {
  appUrl: APP,
  access: { status: "ok", userId: "7b1f2c9e-60f4-4a6a-9b53-0f6f6f0a2c11" },
};
const criteria = {
  handle: HANDLE,
  from: "2032-07-01",
  to: "2032-07-28",
  nights: 14,
  adults: 2,
  children: 0,
  pets: 0,
};

const lookups = {
  findHouseholds: vi.fn<ToolLookups["findHouseholds"]>(),
  findStays: vi.fn<ToolLookups["findStays"]>(),
  listRequests: vi.fn<ToolLookups["listRequests"]>(),
};

beforeEach(() => {
  lookups.findHouseholds.mockReset().mockResolvedValue({
    status: "success",
    listings: [],
    truncated: false,
  });
  lookups.findStays
    .mockReset()
    .mockResolvedValue({ status: "none", options: [], truncated: false });
  lookups.listRequests.mockReset().mockResolvedValue([]);
});

const call = (name: string, args: unknown, context = guest) =>
  callTool(name, args, context, lookups);

function parsed(result: Awaited<ReturnType<typeof call>>) {
  const [text] = result.content;
  expect(text?.type).toBe("text");
  // The text is the same JSON as the structured content.
  expect(JSON.parse((text as { text: string }).text)).toStrictEqual(
    result.structuredContent,
  );
  return result.structuredContent as Record<string, unknown>;
}

const noLookup = () => {
  for (const lookup of Object.values(lookups))
    expect(lookup).not.toHaveBeenCalled();
};

describe("tool list", () => {
  it("declares three read-only tools with shared input schemas", () => {
    expect(TOOLS.map((tool) => tool.name)).toEqual([
      "find_households",
      "search_stays",
      "read_request_status",
    ]);
    expect(TOOLS.map((tool) => tool.inputSchema)).toStrictEqual([
      findHouseholdsSchema(),
      searchStaysSchema(),
      emptySchema(),
    ]);
    for (const tool of TOOLS) {
      expect(tool.title).toBeTruthy();
      expect(tool.annotations).toStrictEqual({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      });
      expect(tool._meta).toStrictEqual({
        securitySchemes: [{ type: "oauth2", scopes: ["openid"] }],
      });
      expect(tool.outputSchema).toMatchObject({
        type: "object",
        required: ["status"],
        additionalProperties: false,
      });
      expect(tool.description).toMatch(/only a host confirms|from hosts/i);
    }
    for (const tool of TOOLS.slice(0, 2))
      expect(tool.description).toMatch(/website/);
    expect(TOOLS[1]!.description).toMatch(/provisional/);
    expect(TOOLS[1]!.description).toMatch(/only a host confirms/i);
  });
});

describe("arguments", () => {
  it.each<[string, unknown]>([
    ["find_households", undefined],
    ["find_households", {}],
    ["find_households", { name: "Casa", extra: true }],
    ["find_households", "Casa"],
    ["search_stays", undefined],
    ["search_stays", { ...criteria, nights: "14" }],
    ["search_stays", { ...criteria, adults: 2.5 }],
    ["search_stays", [criteria]],
    ["read_request_status", { id: HANDLE }],
    ["read_request_status", []],
    ["read_request_status", "mine"],
  ])("refuses %s with %j as invalid, before any lookup", async (name, args) => {
    const result = await call(name, args);
    expect(result.isError).toBe(true);
    const content = parsed(result);
    expect(content.status).toBe("invalid");
    expect(content.next).toEqual(expect.any(String));
    noLookup();
  });

  it("lets the household lookup apply its own rules", async () => {
    lookups.findHouseholds.mockResolvedValue({
      status: "invalid",
      listings: [],
      truncated: false,
    });
    const content = parsed(await call("find_households", { name: "  a " }));
    expect(content.status).toBe("invalid");
    expect(lookups.findHouseholds).toHaveBeenCalledWith("  a ");
  });

  it("reads the status with no argument or an empty object", async () => {
    for (const args of [undefined, {}])
      expect(parsed(await call("read_request_status", args)).status).toBe(
        "none",
      );
    expect(lookups.listRequests).toHaveBeenCalledWith(
      (guest.access as { userId: string }).userId,
    );
  });

  it("treats an unknown tool as a protocol error", async () => {
    const error = await call("send_request", {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProtocolError);
    expect((error as ProtocolError).code).toBe(-32602);
  });
});

describe("results", () => {
  it("answers the limit with the wait in seconds, before any lookup", async () => {
    const limited: ToolContext = {
      appUrl: APP,
      access: { status: "limited", retryAfter: 42 },
    };
    for (const name of ["find_households", "search_stays"]) {
      const result = await call(name, { name: "Casa" }, limited);
      expect(result.isError).toBe(true);
      expect(parsed(result)).toStrictEqual({
        status: "rate_limited",
        retryAfter: 42,
        next: "Too many requests. Wait 42 seconds, then retry.",
      });
    }
    noLookup();
  });

  it.each([
    ["find_households", { name: "Casa" }, "findHouseholds"],
    ["search_stays", criteria, "findStays"],
    ["read_request_status", {}, "listRequests"],
  ] as const)(
    "turns a failure of %s into unavailable",
    async (name, args, lookup) => {
      lookups[lookup].mockRejectedValue(new Error("connection refused"));
      const result = await call(name, args);
      expect(result.isError).toBe(true);
      const content = parsed(result);
      expect(content).toStrictEqual({
        status: "unavailable",
        next: "L’Ayalga could not answer. Retry in a minute.",
      });
    },
  );

  it.each([
    ["find_households", { name: "Casa" }],
    ["search_stays", criteria],
    ["read_request_status", {}],
  ] as const)("answers none for %s with a next step", async (name, args) => {
    const result = await call(name, args);
    expect(result.isError).toBeFalsy();
    const content = parsed(result);
    expect(content.status).toBe("none");
    expect(content.next).toEqual(expect.any(String));
  });

  it("answers not_found for a household that is not listed", async () => {
    lookups.findStays.mockResolvedValue({
      status: "not_found",
      options: [],
      truncated: false,
    });
    const result = await call("search_stays", criteria);
    expect(result.isError).toBeFalsy();
    expect(parsed(result)).toMatchObject({
      status: "not_found",
      next: expect.stringContaining("find_households"),
    });
  });

  it("returns the projected households on success", async () => {
    lookups.findHouseholds.mockResolvedValue({
      status: "success",
      listings: [{ handle: HANDLE, displayName: "Casa" }],
      truncated: false,
    });
    const result = await call("find_households", { name: "Casa" });
    expect(result.isError).toBeFalsy();
    expect(parsed(result)).toStrictEqual({
      status: "success",
      households: [
        { handle: HANDLE, name: "Casa", pageUrl: `${APP}/stays/${HANDLE}` },
      ],
      truncated: false,
    });
  });

  it("keeps the largest search answer under 60,000 characters", async () => {
    // Every text at its stored maximum: 120 + 120 + 240 + 240 characters.
    const rooms = Array.from({ length: 20 }, (_, index) => ({
      ref: `ref-${index}`,
      guestLabel: `${index}`.padEnd(120, "g"),
      floorLabel: `${index}`.padEnd(120, "f"),
      sleepingArrangement: `${index}`.padEnd(240, "s"),
      overflowArrangement: `${index}`.padEnd(240, "o"),
      standardCapacity: 30,
      maximumCapacity: 30,
    }));
    const options: PublicStayOption[] = Array.from(
      { length: 12 },
      (_, index) => ({
        confirmation: "host_approval_required",
        stay: [`2032-07-${10 + index}`, `2032-08-${10 + index}`],
        rooms,
        recommendedRoomRefs: rooms.map((room) => room.ref),
      }),
    );
    lookups.findStays.mockResolvedValue({
      status: "success",
      options,
      truncated: true,
    });
    const result = await call("search_stays", criteria);
    const content = parsed(result);
    expect(content.rooms).toHaveLength(20);
    expect(content.stays).toHaveLength(12);
    expect(JSON.stringify(result).length).toBeLessThan(60_000);
  });
});
