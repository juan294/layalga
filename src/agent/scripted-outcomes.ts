export const SCRIPTED_OUTCOME_PREFIX = "layalga:outcome:";

export type ScriptedOutcomeKey =
  | "escalationSent"
  | "followUpUnavailable"
  | "guestReconfirmationSent"
  | "invitationReady"
  | "ledgerUpdated"
  | "visitConfirmed";

const OUTCOMES = new Set<ScriptedOutcomeKey>([
  "escalationSent",
  "followUpUnavailable",
  "guestReconfirmationSent",
  "invitationReady",
  "ledgerUpdated",
  "visitConfirmed",
]);

export function scriptedOutcome(key: ScriptedOutcomeKey): string {
  return `${SCRIPTED_OUTCOME_PREFIX}${key}`;
}

export function scriptedOutcomeKey(value: string): ScriptedOutcomeKey | null {
  if (!value.startsWith(SCRIPTED_OUTCOME_PREFIX)) return null;
  const key = value.slice(SCRIPTED_OUTCOME_PREFIX.length);
  return OUTCOMES.has(key as ScriptedOutcomeKey)
    ? (key as ScriptedOutcomeKey)
    : null;
}
