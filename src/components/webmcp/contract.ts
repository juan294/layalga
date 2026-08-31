import { isIsoDate } from "@/core/date-stay";

import type { WebMcpInputSchema } from "./types";

export const readAnnotations = {
  readOnlyHint: true,
  untrustedContentHint: true,
} as const;

export const preparationAnnotations = {
  readOnlyHint: false,
  untrustedContentHint: true,
} as const;

export function emptySchema(): WebMcpInputSchema {
  return { type: "object", properties: {}, additionalProperties: false };
}

export function stringArray(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    !value.every((item) => typeof item === "string")
  ) {
    throw new TypeError("Expected a string array");
  }
  return value;
}

export function dateValue(value: unknown): string {
  const result = textValue(value, 10);
  if (!isIsoDate(result)) throw new TypeError("Invalid date");
  return result;
}

export function textValue(value: unknown, maximum: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) {
    throw new TypeError("Invalid text");
  }
  return value.trim();
}

export function boundedText(value: string, maximum: number): string {
  return value.slice(0, maximum);
}
