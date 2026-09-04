import { describe, expect, it } from "vitest";

import { memoryRecordText } from "./record-text";

describe("memoryRecordText", () => {
  it("prefers preference over context in a preference-strategy record", () => {
    expect(
      memoryRecordText(
        JSON.stringify({
          context: "The family mentioned room preferences.",
          preference: "Prefers the ground floor room.",
          categories: ["accommodation"],
        }),
      ),
    ).toBe("Prefers the ground floor room.");
  });

  it("falls back to context when preference is absent", () => {
    expect(
      memoryRecordText(
        JSON.stringify({
          context: "Usually arrives late on Friday evenings.",
          categories: ["arrival"],
        }),
      ),
    ).toBe("Usually arrives late on Friday evenings.");
  });

  it("falls back to the raw text when neither field is present", () => {
    expect(memoryRecordText(JSON.stringify({ categories: ["other"] }))).toBe(
      JSON.stringify({ categories: ["other"] }),
    );
  });

  it("returns plain prose (a semantic/fact record) as-is", () => {
    expect(memoryRecordText("This family travels with one small dog.")).toBe(
      "This family travels with one small dog.",
    );
  });

  it("falls back to raw text for JSON that is not an object (array, primitive)", () => {
    expect(memoryRecordText("[1,2,3]")).toBe("[1,2,3]");
    expect(memoryRecordText("42")).toBe("42");
    expect(memoryRecordText('"just a string"')).toBe('"just a string"');
  });

  it("trims surrounding whitespace", () => {
    expect(
      memoryRecordText(
        JSON.stringify({ preference: "  Prefers a quiet room.  " }),
      ),
    ).toBe("Prefers a quiet room.");
    expect(memoryRecordText("  plain text with padding  ")).toBe(
      "plain text with padding",
    );
  });

  it("caps at 240 characters with an ellipsis", () => {
    const long = "a".repeat(300);
    const result = memoryRecordText(long);
    expect(result.length).toBe(241);
    expect(result.endsWith("…")).toBe(true);
    expect(result.slice(0, 240)).toBe("a".repeat(240));
  });

  it("leaves text at or under the cap untouched", () => {
    const exact = "b".repeat(240);
    expect(memoryRecordText(exact)).toBe(exact);
    const short = "short text";
    expect(memoryRecordText(short)).toBe(short);
  });
});
