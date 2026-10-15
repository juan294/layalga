import { describe, expect, it } from "vitest";

import { contractPreflight, parsePreflightArgs } from "./contract-preflight";

const reader = (status: string, version: string) => ({
  read: async () => ({ status, version }),
});

describe("contractPreflight", () => {
  it("passes only when the runtime serves the release 1 version", async () => {
    await expect(
      contractPreflight("runtime-1", "31", reader("READY", "31")),
    ).resolves.toContain("release 1 version 31");
  });

  it("stops when the runtime serves another version", async () => {
    await expect(
      contractPreflight("runtime-1", "31", reader("READY", "30")),
    ).rejects.toThrow("serves version 30, not the release 1 version 31");
  });

  it("stops while the runtime is not ready", async () => {
    await expect(
      contractPreflight("runtime-1", "31", reader("UPDATING", "31")),
    ).rejects.toThrow("not READY");
  });

  it("requires both arguments", () => {
    expect(
      parsePreflightArgs(["--", "--runtime-id", "r", "--expected-version", "31"]),
    ).toEqual({ runtimeId: "r", expectedVersion: "31" });
    expect(() => parsePreflightArgs(["--runtime-id", "r"])).toThrow("Usage");
  });
});
