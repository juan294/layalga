export function safeNextPath(value: string | null): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    return "/en";
  }
  return value;
}

/** Only these routes admit a requester without a party or host claim. */
export function isRequesterPath(value: string): boolean {
  return /^\/(en|es)\/requests(?:\/(?:review|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}))?$/.test(
    value,
  );
}
