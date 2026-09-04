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
