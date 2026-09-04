import type enMessages from "../../messages/en.json";

export type DecisionReasonKey = keyof typeof enMessages.Host.decisionReasons;

const KEY_BY_CODE: Record<string, DecisionReasonKey> = {
  special_request: "specialRequest",
  children: "children",
  pets: "pets",
  beds: "beds",
  overflow: "overflow",
};

/**
 * Maps a stored decision reason code (`special_request`, `children`, ...)
 * to a `Host.decisionReasons.*` message key. The single source of truth for
 * the code-to-category mapping: the host page's `t("decisionReasons.…")`
 * lookup and the host email pings' reason phrasing both classify a reason
 * code through this function, so the two surfaces never drift on *which*
 * category a code belongs to, even though each renders its own copy for it
 * (the dashboard shows a standalone sentence; an email pending-decision
 * ping embeds the reason as a noun phrase mid-sentence, so it keeps its own
 * wording rather than the dashboard's full sentence).
 */
export function decisionReasonKey(
  reasonOrDecision: unknown,
): DecisionReasonKey {
  const code =
    typeof reasonOrDecision === "string" ? reasonOrDecision : undefined;
  return (code && KEY_BY_CODE[code]) || "other";
}
