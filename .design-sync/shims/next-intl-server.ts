// design-sync preview shim for `next-intl/server`. Server components call
// getTranslations(), which reads per-request config that does not exist in a
// static preview. This builds a real next-intl translator over the repo's own
// messages/en.json, so preview copy is the shipped copy.
import { createTranslator } from "next-intl";

import messages from "../../messages/en.json";

type NamespaceArg = string | { locale?: string; namespace?: string } | undefined;

export async function getTranslations(arg?: NamespaceArg) {
  const namespace = typeof arg === "string" ? arg : arg?.namespace;
  const locale = (typeof arg === "object" && arg?.locale) || "en";
  return createTranslator({ locale, messages, namespace }) as ReturnType<
    typeof createTranslator
  >;
}
