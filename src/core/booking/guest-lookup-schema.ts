import { MAX_ADULTS, MAX_CHILDREN, MAX_PETS } from "@/agent/task-limits";

// No server import: the website's WebMCP tools and the assistant endpoint
// describe the same input.

export function findHouseholdsSchema() {
  return {
    type: "object" as const,
    properties: { name: { type: "string", minLength: 2, maxLength: 80 } },
    required: ["name"],
    additionalProperties: false as const,
  };
}

export function searchStaysSchema() {
  return {
    type: "object" as const,
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
    required: ["handle", "from", "to", "nights", "adults", "children", "pets"],
    additionalProperties: false as const,
  };
}
