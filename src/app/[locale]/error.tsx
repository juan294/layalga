"use client";

import { useLocale, useTranslations } from "next-intl";

export default function LocaleError({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  const locale = useLocale();
  const t = useTranslations("RouteStates");

  return (
    <main className="route-state-shell">
      <section className="route-state-card" role="alert">
        <p className="route-state-eyebrow">{t("errorEyebrow")}</p>
        <h1>{t("errorTitle")}</h1>
        <p>{t("errorBody")}</p>
        <div className="route-state-actions">
          <button onClick={reset} type="button">
            {t("retry")}
          </button>
          <a href={`/${locale}`}>{t("home")}</a>
        </div>
      </section>
    </main>
  );
}
