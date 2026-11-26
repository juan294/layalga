import { createTranslator } from "next-intl";

import en from "../../messages/en.json";
import es from "../../messages/es.json";

/** Stands in for "next-intl/server" in a page test, with the real messages. */
export const setRequestLocale = () => undefined;

export const getTranslations = async ({
  locale,
  namespace,
}: {
  locale: "en" | "es";
  namespace: keyof typeof en;
}) =>
  createTranslator({
    locale,
    messages: locale === "es" ? es : en,
    namespace,
  });
