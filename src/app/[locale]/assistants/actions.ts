"use server";

import { refresh } from "next/cache";

import {
  disconnectAssistant,
  type DisconnectResult,
} from "@/lib/auth/connected-assistants";
import { createClient } from "@/lib/supabase/server";

export async function disconnect(
  _previous: DisconnectResult | null,
  form: FormData,
): Promise<DisconnectResult> {
  const result = await disconnectAssistant(form.get("clientId"), {
    supabase: await createClient(),
  });
  // Show the list that Auth holds now, whatever the result.
  refresh();
  return result;
}
