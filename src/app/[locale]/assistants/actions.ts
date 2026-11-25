"use server";

import { refresh } from "next/cache";

import {
  disconnectAssistant,
  type DisconnectResult,
} from "@/lib/auth/connected-assistants";
import { createClient } from "@/lib/supabase/server";

/** The result carries the submitted name, because its row can be gone. */
export async function disconnect(
  _previous: unknown,
  form: FormData,
): Promise<DisconnectResult & { name: string }> {
  const result = await disconnectAssistant(form.get("clientId"), {
    supabase: await createClient(),
  });
  // Show the list that Auth holds now, whatever the result.
  refresh();
  const name = form.get("name");
  return { ...result, name: typeof name === "string" ? name : "" };
}
