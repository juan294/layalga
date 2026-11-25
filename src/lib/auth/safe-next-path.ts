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

/** A guest can return directly to these request history and review routes. */
export function isRequesterPath(value: string): boolean {
  return /^\/(en|es)\/requests(?:\/(?:review|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}))?$/.test(
    value,
  );
}

/** The ID that Auth gives one assistant request. */
export function isAuthorizationId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{16,128}$/.test(value);
}

export function assistantConsentPath(
  locale: string,
  authorizationId: string,
): string {
  return `/${locale}/oauth/consent?authorization_id=${authorizationId}`;
}

/** A guest returns to the consent page of one assistant request. */
export function isAssistantConsentPath(value: string): boolean {
  const id = value.slice(assistantConsentPath("en", "").length);
  return (
    isAuthorizationId(id) &&
    ["en", "es"].some((locale) => value === assistantConsentPath(locale, id))
  );
}

/** The list of connected assistants. */
export function isAssistantsPath(value: string): boolean {
  return /^\/(en|es)\/assistants$/.test(value);
}

export function staySearchKeys(hasHandle: boolean): readonly string[] {
  return hasHandle
    ? ["from", "to", "nights", "adults", "children", "pets"]
    : ["q"];
}

/** Only booking routes built by the stay finder can be restored after Google sign-in. */
export function isStaySearchPath(value: string, locale?: string): boolean {
  if (
    value.length > 1500 ||
    value.includes("#") ||
    safeNextPath(value) !== value
  )
    return false;
  const [pathname] = value.split("?");
  const query = value.slice(pathname.length + 1);
  const match =
    /^\/(en|es)\/stays(?:\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}))?$/.exec(
      pathname,
    );
  if (!match || (locale && match[1] !== locale)) return false;
  const allowed = staySearchKeys(Boolean(match[2]));
  const seen = new Set<string>();
  for (const [key, term] of new URLSearchParams(query)) {
    if (
      !allowed.includes(key) ||
      seen.has(key) ||
      /[\u0000-\u001f\u007f]/.test(term)
    )
      return false;
    seen.add(key);
  }
  return true;
}
