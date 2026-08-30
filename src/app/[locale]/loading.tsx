import { getTranslations } from "next-intl/server";

export default async function LocaleLoading() {
  const t = await getTranslations("RouteStates");

  return (
    <main className="route-state-shell">
      <section aria-busy="true" aria-live="polite" className="route-state-card">
        <p className="route-state-eyebrow">{t("loadingEyebrow")}</p>
        <h1>{t("loadingTitle")}</h1>
        <p>{t("loadingBody")}</p>
      </section>
    </main>
  );
}
