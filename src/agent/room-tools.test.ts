import { describe, expect, it } from "vitest";

import { buildTools } from "./deps";
import type { AgentDeps } from "./ports";

describe("room coordination tool authority", () => {
  it("keeps authority and private fields out of model-facing room schemas", () => {
    const tools = buildTools({} as AgentDeps, "host_room_request").map(
      (candidate) => {
        const internal = candidate as unknown as {
          _functionTool: {
            name: string;
            toolSpec: {
              inputSchema: { properties?: Record<string, unknown> };
            };
          };
        };
        return internal._functionTool;
      },
    );
    const roomTools = tools.filter(({ name }) =>
      ["list_guest_rooms", "find_room_options", "prepare_room_action"].includes(
        name,
      ),
    );

    expect(roomTools.map(({ name }) => name)).toEqual([
      "list_guest_rooms",
      "find_room_options",
      "prepare_room_action",
    ]);
    for (const roomTool of roomTools) {
      expect(roomTool.toolSpec.inputSchema.properties).not.toHaveProperty(
        "homeId",
      );
      expect(roomTool.toolSpec.inputSchema.properties).not.toHaveProperty(
        "hostId",
      );
      expect(roomTool.toolSpec.inputSchema.properties).not.toHaveProperty(
        "runId",
      );
      expect(roomTool.toolSpec.inputSchema.properties).not.toHaveProperty(
        "privateNote",
      );
    }
    expect(tools.map(({ name }) => name)).not.toContain(
      "apply_room_action_proposal",
    );
  });

  it("does not expose room proposal tools to unrelated tasks", () => {
    const names = buildTools({} as AgentDeps, "guest_submit").map(
      (candidate) =>
        (
          candidate as unknown as {
            _functionTool: { name: string };
          }
        )._functionTool.name,
    );
    expect(names).not.toContain("prepare_room_action");
    expect(names).not.toContain("list_guest_rooms");
    expect(names).not.toContain("find_room_options");
  });

  it("does not expose unrelated mutation tools to a room request", () => {
    const names = buildTools({} as AgentDeps, "host_room_request").map(
      (candidate) =>
        (
          candidate as unknown as {
            _functionTool: { name: string };
          }
        )._functionTool.name,
    );
    expect(names).toEqual([
      "list_guest_rooms",
      "find_room_options",
      "prepare_room_action",
    ]);
  });
});
