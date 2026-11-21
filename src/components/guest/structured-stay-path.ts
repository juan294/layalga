import type { AppLocale } from "@/i18n/routing";
import type { GuestConversationState } from "@/core/booking/guest-conversation-contract";

export function structuredStayPath(
  locale: AppLocale,
  state: GuestConversationState,
) {
  if (!state.handle) return "#structured-stay-search";
  const params = new URLSearchParams();
  for (const field of [
    "from",
    "to",
    "nights",
    "adults",
    "children",
    "pets",
  ] as const) {
    if (state[field] !== undefined) params.set(field, String(state[field]));
  }
  const query = params.toString();
  return `/${locale}/stays/${state.handle}${query ? "?" + query : ""}#structured-stay-search`;
}
