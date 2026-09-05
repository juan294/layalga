import { describe, expect, it } from "vitest";
import { householdPolicyInput } from "./settings";

describe("household policy validation", () => {
  it.each([0, 21, 1.5, NaN])("rejects an unsupported child-family limit %s", (value) => {
    expect(householdPolicyInput.safeParse({ expectedVersion: 1, petsTogetherAllowed: false, maxFamiliesWithChildren: value }).success).toBe(false);
  });
  it("requires a real boolean and a positive integer policy version", () => {
    expect(householdPolicyInput.safeParse({ expectedVersion: 1, petsTogetherAllowed: "false", maxFamiliesWithChildren: 1 }).success).toBe(false);
    expect(householdPolicyInput.safeParse({ expectedVersion: 0, petsTogetherAllowed: false, maxFamiliesWithChildren: 1 }).success).toBe(false);
  });
  it.each([1, 20])("accepts the supported limit boundary %s", (value) => {
    expect(householdPolicyInput.parse({ expectedVersion: 1, petsTogetherAllowed: false, maxFamiliesWithChildren: value }).maxFamiliesWithChildren).toBe(value);
  });
});
