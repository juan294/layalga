import { expect, it, vi } from "vitest";
import { createPublicStayTools } from "./public-tools";

it("looks up homes and reads actual availability with no invitation", async () => {
  const discover = vi.fn().mockResolvedValue({
    listings: [{ handle: "home", displayName: "House" }],
    truncated: false,
  });
  const search = vi
    .fn()
    .mockResolvedValue({ status: "none", options: [], truncated: false });
  const [lookup, availability] = createPublicStayTools({ discover, search });
  expect(await lookup!.execute({ name: "House" })).toEqual(
    await discover.mock.results[0]!.value,
  );
  const input = {
    handle: "home",
    from: "2027-07-01",
    to: "2027-08-01",
    nights: 14,
    adults: 2,
    children: 0,
    pets: 0,
  };
  expect(await availability!.execute(input)).toMatchObject({ status: "none" });
  expect(search).toHaveBeenCalledWith(input);
  expect(
    lookup!.annotations.readOnlyHint && availability!.annotations.readOnlyHint,
  ).toBe(true);
});

it("returns the ordinary lookup recovery when the browser loses its connection", async () => {
  const offline = vi.fn().mockRejectedValue(new Error("Failed to fetch"));
  const [discover, search] = createPublicStayTools({
    discover: offline,
    search: offline,
  });
  expect(await discover!.execute({ name: "House" })).toEqual({
    status: "unavailable",
    listings: [],
    truncated: false,
  });
  expect(await search!.execute({})).toEqual({
    status: "unavailable",
    options: [],
    truncated: false,
  });
});

// Captured from the tool objects before the schemas moved to a shared module.
const BASELINE = [
  {
    name: "layalga.public.find_households",
    title: "Find a household",
    description:
      "With an active Google session, find published households by name. Choose a match and use its handle to check available stays. If none match, refine the name. Use at least two characters. If unavailable, retry later.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          minLength: 2,
          maxLength: 80,
        },
      },
      required: ["name"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      untrustedContentHint: true,
    },
  },
  {
    name: "layalga.public.search_stays",
    title: "Check available stays",
    description:
      "With an active Google session, find whole-stay room choices in a published household. Each stay contains check-in and checkout dates. No match means try a different window or party. For invalid input, check the dates, duration and party size. If the household is missing, look it up again. If unavailable, retry later. To prepare a choice, open the matching household and display these search results using the page form. Availability is provisional until a host confirms.",
    inputSchema: {
      type: "object",
      properties: {
        handle: {
          type: "string",
          description: "Public handle returned by household search",
        },
        from: {
          type: "string",
          format: "date",
          description: "Earliest check-in",
        },
        to: {
          type: "string",
          format: "date",
          description: "Latest checkout, within 90 days of earliest check-in",
        },
        nights: {
          type: "integer",
          minimum: 1,
          maximum: 30,
        },
        adults: {
          type: "integer",
          minimum: 1,
          maximum: 12,
        },
        children: {
          type: "integer",
          minimum: 0,
          maximum: 12,
        },
        pets: {
          type: "integer",
          minimum: 0,
          maximum: 6,
        },
      },
      required: [
        "handle",
        "from",
        "to",
        "nights",
        "adults",
        "children",
        "pets",
      ],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      untrustedContentHint: true,
    },
  },
];

it("keeps the tool objects the website registers", () => {
  const tools = createPublicStayTools({
    discover: vi.fn(),
    search: vi.fn(),
  }).map((tool) =>
    Object.fromEntries(
      Object.entries(tool).filter(([key]) => key !== "execute"),
    ),
  );
  expect(tools).toStrictEqual(BASELINE);
});
