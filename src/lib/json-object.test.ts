import { describe, expect, it } from "vitest";

import {
  invitationRememberedContext,
  invitationSpecialRequests,
  objectValue,
} from "./json-object";

describe("objectValue", () => {
  it("parses a JSON string and rejects arrays and primitives", () => {
    expect(objectValue('{"a":1}')).toEqual({ a: 1 });
    expect(objectValue({ a: 1 })).toEqual({ a: 1 });
    expect(objectValue([1, 2])).toBeNull();
    expect(objectValue("not json")).toBeNull();
    expect(objectValue(null)).toBeNull();
    expect(objectValue(42)).toBeNull();
  });
});

describe("invitationSpecialRequests", () => {
  it("reads only specialRequests, ignoring rememberedContext entirely", () => {
    expect(
      invitationSpecialRequests({
        specialRequests: ["step-free access"],
        rememberedContext: ["prefers the ground floor room"],
      }),
    ).toEqual(["step-free access"]);
  });

  it("returns an empty array for a missing or malformed source", () => {
    expect(invitationSpecialRequests(undefined)).toEqual([]);
    expect(invitationSpecialRequests(null)).toEqual([]);
    expect(invitationSpecialRequests({})).toEqual([]);
    expect(
      invitationSpecialRequests({ specialRequests: "not an array" }),
    ).toEqual([]);
    expect(
      invitationSpecialRequests({ specialRequests: ["a", 2, null, "b"] }),
    ).toEqual(["a", "b"]);
  });
});

describe("invitationRememberedContext", () => {
  it("reads only rememberedContext, ignoring specialRequests entirely", () => {
    expect(
      invitationRememberedContext({
        specialRequests: ["step-free access"],
        rememberedContext: ["prefers the ground floor room"],
      }),
    ).toEqual(["prefers the ground floor room"]);
  });

  it("returns an empty array when absent", () => {
    expect(invitationRememberedContext({ specialRequests: ["a"] })).toEqual([]);
    expect(invitationRememberedContext(undefined)).toEqual([]);
  });
});
