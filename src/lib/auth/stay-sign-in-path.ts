import type { AppLocale } from "@/i18n/routing";
import { isStaySearchPath, staySearchKeys } from "./safe-next-path";

/** Keep only public search criteria in the OAuth return URL. */
export function staySignInPath(
  locale: AppLocale,
  handle: string | undefined,
  query: Record<string, unknown>,
) {
  const directory = `/${locale}/stays`;
  const path = handle
    ? `${directory}/${encodeURIComponent(handle)}`
    : directory;
  const search = new URLSearchParams();
  for (const key of staySearchKeys(Boolean(handle))) {
    const value = query[key];
    if (typeof value === "string" || typeof value === "number")
      search.set(key, String(value));
  }
  const proposed = search.size ? `${path}?${search}` : path;
  const next = isStaySearchPath(proposed, locale)
    ? proposed
    : isStaySearchPath(path, locale)
      ? path
      : directory;
  return `/${locale}/sign-in?${new URLSearchParams({ next })}`;
}
