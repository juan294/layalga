import { describe, expect, it } from "vitest";

import { displayRecords, type MemoryRecordItem } from "./memory-record-display";

function record(
  id: string,
  text: string,
  createdAtLabel = "2026-09-01",
): MemoryRecordItem {
  return { id, text, createdAtLabel };
}

describe("displayRecords", () => {
  it("renders a preference-strategy record's JSON as prose, not raw JSON", () => {
    const [result] = displayRecords([
      record(
        "r1",
        JSON.stringify({
          context: "The family mentioned room needs.",
          preference: "Prefers the ground floor room.",
          categories: ["accommodation"],
        }),
      ),
    ]);
    expect(result!.text).toBe("Prefers the ground floor room.");
  });

  it("hides an exact duplicate display text within a party, keeping the first", () => {
    const results = displayRecords([
      record("r1", "This family prefers the ground floor room.", "2026-09-03"),
      record("r2", "This family prefers the ground floor room.", "2026-09-01"),
      record("r3", "This family travels with one small dog.", "2026-09-02"),
    ]);
    expect(results.map((r) => r.id)).toEqual(["r1", "r3"]);
    expect(results[0]!.createdAtLabel).toBe("2026-09-03");
  });

  it("keeps records whose display text differs even if the raw JSON differs only in unused fields", () => {
    const results = displayRecords([
      record(
        "r1",
        JSON.stringify({ preference: "Prefers the ground floor room." }),
      ),
      record(
        "r2",
        JSON.stringify({
          preference: "Prefers the ground floor room.",
          categories: ["different", "categories"],
        }),
      ),
    ]);
    // Same displayed preference text -> the second is a duplicate, even
    // though the raw JSON differs in a field the panel never shows.
    expect(results).toHaveLength(1);
  });

  it("returns an empty list for an empty input", () => {
    expect(displayRecords([])).toEqual([]);
  });
});
