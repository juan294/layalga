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

function stringArrayField(structured: unknown, key: string): string[] {
  const value = objectValue(structured)?.[key];
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

/**
 * Reads an invitation's `structured.specialRequests` as a plain string
 * array, tolerating a missing, non-object, or non-array/non-string source.
 * Shared by `src/agent/run-task.ts` (the guest_submit prompt and canonical
 * guest submission) and `src/agent/record-capture-memory.ts` (the name-free
 * memory event's facts text) so the one JSON shape is read the same way in
 * both places. Deliberately reads only the `specialRequests` key, so it
 * never picks up `structured.rememberedContext` -- recalled facts must
 * never feed a guest submission or booking policy (see
 * `invitationRememberedContext` below for the informational-only field).
 */
export function invitationSpecialRequests(structured: unknown): string[] {
  return stringArrayField(structured, "specialRequests");
}

/**
 * Reads an invitation's `structured.rememberedContext` as a plain string
 * array: what `search_memory` recalled about the family, for display only
 * (the host capture summary). Never consumed by booking policy, the
 * canonical guest submission, or `recordCaptureMemory`'s memory write.
 */
export function invitationRememberedContext(structured: unknown): string[] {
  return stringArrayField(structured, "rememberedContext");
}
