"use server";

import { guestTurn } from "@/core/booking/guest-conversation";
export async function guestConversationTurn(input: unknown) {
  return guestTurn(input);
}
