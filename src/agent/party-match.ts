import { foldText } from "@/lib/text-fold";

/**
 * Deterministic, case- and diacritic-insensitive pre-match between a
 * household party's family name and a host's raw invitation text. Used only
 * to decide whether a `host_capture` task's authority is scoped to an
 * existing party (see `authorityForTask` in `src/agent/run-task.ts`), so a
 * matched capture can read that party's remembered preferences before the
 * model has run `capture_invitation`. Independent of the exact-name party
 * reuse `captureInvitation` performs once the model chooses a party name
 * (`src/core/booking/invitations.ts`).
 *
 * A generic household-name prefix ("Familia", "La Familia", "The", "Family")
 * is stripped first: hosts write the display name formally ("Familia Vega")
 * but mention guests informally ("los Vega quieren venir"), so matching the
 * bare surname is what actually finds them in free text.
 */
const GENERIC_PREFIXES = [
  "la familia",
  "familia",
  "the family",
  "family",
  "the",
  "los",
  "las",
];

export function matchFamilyNameInMessage(
  familyName: string,
  rawMessage: string,
): boolean {
  const surname = significantPart(familyName);
  if (!surname) return false;
  return foldText(rawMessage).includes(surname);
}

function significantPart(familyName: string): string {
  let remainder = foldText(familyName);
  let stripped = true;
  while (stripped) {
    stripped = false;
    for (const prefix of GENERIC_PREFIXES) {
      if (remainder === prefix) {
        remainder = "";
        continue;
      }
      if (remainder.startsWith(`${prefix} `)) {
        remainder = remainder.slice(prefix.length + 1).trim();
        stripped = true;
      }
    }
  }
  return remainder;
}
