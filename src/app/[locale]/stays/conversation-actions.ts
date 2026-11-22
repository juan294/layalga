"use server";

import { guestTurn } from "@/core/booking/guest-conversation";
import type { GuestConversationReply } from "@/core/booking/guest-conversation-contract";
import { verifiedRequester } from "@/lib/auth/verified-requester";

export async function guestConversationTurn(
  input: unknown,
): Promise<GuestConversationReply> {
  const spanish =
    input !== null &&
    typeof input === "object" &&
    "locale" in input &&
    input.locale === "es";
  try {
    if (!(await verifiedRequester()))
      return {
        kind: "sign_in",
        state: {},
        message: spanish
          ? "Inicia sesión con Google para buscar alojamiento y consultar las fechas disponibles."
          : "Sign in with Google to find a household and check available dates.",
      };
  } catch {
    return {
      kind: "unavailable",
      state: {},
      message: spanish
        ? "No se ha podido comprobar tu sesión. Inténtalo de nuevo."
        : "We couldn’t check your session. Please try again.",
    };
  }
  return guestTurn(input);
}
