import { readAnnotations } from "./contract";
import type { WebMcpTool } from "./types";
import { MAX_ADULTS, MAX_CHILDREN, MAX_PETS } from "@/agent/task-limits";

export function createPublicStayTools(actions: {
  discover: (name: unknown) => Promise<unknown>;
  search: (input: Record<string, unknown>) => Promise<unknown>;
}): WebMcpTool[] {
  return [
    {
      name: "layalga.public.find_households",
      title: "Find a household",
      description:
        "With an active Google session, find published households by name. Choose a match and use its handle to check available stays. If none match, refine the name. Use at least two characters. If unavailable, retry later.",
      inputSchema: {
        type: "object",
        properties: { name: { type: "string", minLength: 2, maxLength: 80 } },
        required: ["name"],
        additionalProperties: false,
      },
      annotations: readAnnotations,
      execute: (input) =>
        actions
          .discover(
            input && Object.keys(input).length === 1 ? input.name : undefined,
          )
          .catch(() => ({
            status: "unavailable",
            listings: [],
            truncated: false,
          })),
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
          nights: { type: "integer", minimum: 1, maximum: 30 },
          adults: { type: "integer", minimum: 1, maximum: MAX_ADULTS },
          children: { type: "integer", minimum: 0, maximum: MAX_CHILDREN },
          pets: { type: "integer", minimum: 0, maximum: MAX_PETS },
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
      annotations: readAnnotations,
      execute: (input) =>
        actions.search(input).catch(() => ({
          status: "unavailable",
          options: [],
          truncated: false,
        })),
    },
  ];
}
