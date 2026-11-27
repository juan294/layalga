"use server";

import {
  decideConsent,
  reviewConsent,
  type ConsentState,
} from "@/lib/auth/assistant-consent";
import { consentDeps } from "@/lib/auth/assistant-consent-deps";

export async function continueAssistantConsent(
  authorizationId: unknown,
  shownEmail: unknown,
): Promise<ConsentState> {
  return reviewConsent(authorizationId, shownEmail, await consentDeps());
}

export async function decideAssistantAccess(
  authorizationId: unknown,
  decision: unknown,
): Promise<ConsentState> {
  return decideConsent(authorizationId, decision, await consentDeps());
}
