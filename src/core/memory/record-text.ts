const MAX_LENGTH = 240;

/**
 * Renders one memory record's raw content for display. A user-preference
 * strategy record's content is a JSON string shaped like
 * `{"context", "preference", "categories"}`; a semantic (fact) record's
 * content is already plain prose. Prefers `preference` (the distilled
 * takeaway), falls back to `context` (the fuller note), and falls back
 * again to the raw content when it is not that JSON shape at all (plain
 * prose, or JSON that parses to something else entirely). Trims the result
 * and caps it at 240 characters with a trailing ellipsis so one remembered
 * fact never dominates the host panel.
 */
export function memoryRecordText(content: string): string {
  const text = preferredText(content).trim();
  return text.length > MAX_LENGTH
    ? `${text.slice(0, MAX_LENGTH).trimEnd()}…`
    : text;
}

function preferredText(content: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return content;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return content;
  }
  const record = parsed as Record<string, unknown>;
  if (typeof record.preference === "string" && record.preference.trim()) {
    return record.preference;
  }
  if (typeof record.context === "string" && record.context.trim()) {
    return record.context;
  }
  return content;
}
