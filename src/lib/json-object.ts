/**
 * Coerces a jsonb column value into a plain object, tolerating the value
 * arriving pre-parsed or as a JSON string. Arrays and primitives are
 * rejected: callers only want key/value payloads.
 */
export function objectValue(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    try {
      return objectValue(JSON.parse(value));
    } catch {
      return null;
    }
  }
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Reads an invitation's `structured.specialRequests` as a plain string
 * array, tolerating a missing, non-object, or non-array/non-string source.
 * Shared by `src/agent/run-task.ts` (the guest_submit prompt and canonical
 * guest submission) and `src/agent/record-capture-memory.ts` (the name-free
 * memory event's facts text) so the one JSON shape is read the same way in
 * both places.
 */
export function invitationSpecialRequests(structured: unknown): string[] {
  const value = objectValue(structured)?.specialRequests;
  return Array.isArray(value)
    ? value.filter((request): request is string => typeof request === "string")
    : [];
}
