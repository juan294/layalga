import { memoryRecordText } from "@/core/memory/record-text";

export interface MemoryRecordItem {
  id: string;
  text: string;
  createdAtLabel: string;
}

/**
 * Renders each record's raw content through `memoryRecordText` (so a
 * preference-strategy record's `{"context","preference","categories"}` JSON
 * shows as prose, never raw JSON), then hides an exact duplicate display
 * text within the party -- keeping only the first (most recent, since
 * `records` already arrives sorted newest first) occurrence.
 *
 * Kept out of `memory-panel.tsx` itself so this pure transform can be unit
 * tested without pulling in that component's `"use server"` action import
 * chain.
 */
export function displayRecords(
  records: readonly MemoryRecordItem[],
): MemoryRecordItem[] {
  const seen = new Set<string>();
  const result: MemoryRecordItem[] = [];
  for (const record of records) {
    const text = memoryRecordText(record.text);
    if (seen.has(text)) continue;
    seen.add(text);
    result.push({ id: record.id, text, createdAtLabel: record.createdAtLabel });
  }
  return result;
}
