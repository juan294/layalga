import { describe, expect, it } from "vitest";

import { memoryConfigForTask, memoryStoresForTask } from "./memory";
import type { AgentAuthority } from "./ports";

const config = {
  memory: "agentcore" as const,
  memoryId: "mem-123",
  awsRegion: "us-east-1",
};
const noneConfig = {
  memory: "none" as const,
  memoryId: undefined,
  awsRegion: undefined,
};

const homeAuthority: AgentAuthority = { homeId: "home-1" };
const partyAuthority: AgentAuthority = { homeId: "home-1", partyId: "party-9" };

describe("memoryStoresForTask", () => {
  it("returns no stores when MEMORY is not agentcore, for every task", () => {
    expect(
      memoryStoresForTask("guest_submit", partyAuthority, "inv_1", noneConfig),
    ).toEqual([]);
    expect(
      memoryStoresForTask(
        "host_capture",
        homeAuthority,
        "capture_1",
        noneConfig,
      ),
    ).toEqual([]);
  });

  it("never attaches a store for a host room request", () => {
    expect(
      memoryStoresForTask("host_room_request", homeAuthority, "room_1", config),
    ).toEqual([]);
  });

  it("attaches a writable, extracting family store for guest_submit and guest_change", () => {
    for (const task of ["guest_submit", "guest_change"] as const) {
      const [store] = memoryStoresForTask(
        task,
        partyAuthority,
        "inv_1",
        config,
      );
      expect(store).toBeDefined();
      expect(store!.writable).toBe(true);
      expect(store!.extraction).toBeTruthy();
    }
  });

  it("attaches a read-only family store for guest_reconfirm, tick, resume, and host_capture", () => {
    for (const task of [
      "guest_reconfirm",
      "tick",
      "resume",
      "host_capture",
    ] as const) {
      const [store] = memoryStoresForTask(
        task,
        partyAuthority,
        "inv_1",
        config,
      );
      expect(store).toBeDefined();
      expect(store!.writable).toBe(false);
      expect(store!.extraction).toBeFalsy();
    }
  });

  it("never extraction-backs host_capture, matched party or not (D7)", () => {
    const [matched] = memoryStoresForTask(
      "host_capture",
      partyAuthority,
      "capture_1",
      config,
    );
    expect(matched!.writable).toBe(false);
    expect(matched!.extraction).toBeFalsy();

    const [unmatched] = memoryStoresForTask(
      "host_capture",
      homeAuthority,
      "capture_1",
      config,
    );
    expect(unmatched!.writable).toBe(false);
    expect(unmatched!.extraction).toBeFalsy();
  });

  it("attaches a read-only household store for an unmatched host_capture", () => {
    const [store] = memoryStoresForTask(
      "host_capture",
      homeAuthority,
      "capture_1",
      config,
    );
    expect(store).toBeDefined();
    expect(store!.writable).toBe(false);
  });

  it("attaches no store for host_capture without any home authority", () => {
    expect(
      memoryStoresForTask("host_capture", undefined, "capture_1", config),
    ).toEqual([]);
  });

  it("resolves concrete namespaces with no unresolved placeholder braces", () => {
    const [householdStore] = memoryStoresForTask(
      "host_capture",
      homeAuthority,
      "capture_1",
      config,
    );
    const [familyStore] = memoryStoresForTask(
      "guest_submit",
      partyAuthority,
      "inv_1",
      config,
    );
    for (const store of [householdStore!, familyStore!]) {
      const namespace = String(
        (store as unknown as { resolvedNamespace: string }).resolvedNamespace,
      );
      expect(namespace).not.toMatch(/[{}]/);
    }
  });
});

describe("memoryConfigForTask", () => {
  it("returns undefined when no store would be attached", () => {
    expect(
      memoryConfigForTask("host_room_request", homeAuthority, "room_1", config),
    ).toBeUndefined();
    expect(
      memoryConfigForTask("guest_submit", partyAuthority, "inv_1", noneConfig),
    ).toBeUndefined();
  });

  it("configures search_memory without injection or add_memory", () => {
    const managerConfig = memoryConfigForTask(
      "guest_submit",
      partyAuthority,
      "inv_1",
      config,
    );
    expect(managerConfig).toMatchObject({
      addToolConfig: false,
      injection: false,
    });
    expect(managerConfig!.stores).toHaveLength(1);
    expect(managerConfig!.searchToolConfig).toMatchObject({
      description: expect.stringContaining("household remembers"),
    });
  });
});
