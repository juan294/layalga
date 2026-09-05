import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireHost: vi.fn(),
  update: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("@/lib/auth/current-host", () => ({ requireHost: mocks.requireHost }));
vi.mock("@/core/db/client", () => ({
  getDatabaseConnection: () => ({ db: "database" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/core/policy/settings", async (original) => ({
  ...(await original<object>()),
  updateHouseholdPolicy: mocks.update,
}));

import { updateHouseholdPolicyAction } from "./policy-actions";
import { PolicyVersionConflictError } from "@/core/policy/settings";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireHost.mockResolvedValue({
    id: "trusted-host",
    homeId: "trusted-home",
  });
  mocks.update.mockResolvedValue({
    version: 2,
    petsTogetherAllowed: true,
    maxFamiliesWithChildren: 2,
  });
});

function form() {
  const data = new FormData();
  Object.entries({
    locale: "en",
    homeId: "forged-home",
    hostId: "forged-host",
    expectedVersion: "1",
    petsTogetherAllowed: "on",
    maxFamiliesWithChildren: "2",
  }).forEach(([key, value]) => data.set(key, value));
  return data;
}

it("uses authenticated household authority instead of posted identifiers", async () => {
  expect(
    await updateHouseholdPolicyAction({ status: "idle" }, form()),
  ).toMatchObject({ status: "saved", policy: { version: 2 } });
  expect(mocks.update).toHaveBeenCalledWith("database", {
    homeId: "trusted-home",
    hostId: "trusted-host",
    expectedVersion: 1,
    petsTogetherAllowed: true,
    maxFamiliesWithChildren: 2,
  });
});

it("rejects malformed limits before writing", async () => {
  const data = form();
  data.set("maxFamiliesWithChildren", "0");
  expect(await updateHouseholdPolicyAction({ status: "idle" }, data)).toEqual({
    status: "error",
    error: "invalid",
  });
  expect(mocks.update).not.toHaveBeenCalled();
});

it("requires renewed review when another host changed policy", async () => {
  mocks.update.mockRejectedValueOnce(new PolicyVersionConflictError());
  expect(await updateHouseholdPolicyAction({ status: "idle" }, form())).toEqual(
    { status: "error", error: "stale" },
  );
});

it("never writes when authentication fails", async () => {
  mocks.requireHost.mockRejectedValueOnce(new Error("sign in"));
  await expect(
    updateHouseholdPolicyAction({ status: "idle" }, form()),
  ).rejects.toThrow("sign in");
  expect(mocks.update).not.toHaveBeenCalled();
});
