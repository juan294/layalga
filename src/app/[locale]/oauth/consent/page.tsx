import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { AssistantConsent } from "@/components/guest/assistant-consent";
import { RequestShell } from "@/components/guest/request-shell";
import type { AppLocale } from "@/i18n/routing";
import { startConsent } from "@/lib/auth/assistant-consent";
import { consentDeps } from "@/lib/auth/assistant-consent-deps";

// "no-referrer" would also hide the origin from this site's own sign-out form.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: "same-origin",
};

export default async function ConsentPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: AppLocale }>;
  searchParams: Promise<{
    authorization_id?: string | string[];
    auth?: string | string[];
  }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { authorization_id: authorizationId, auth } = await searchParams;
  const t = await getTranslations({ locale, namespace: "Assistants" });
  const initial = await startConsent(authorizationId, await consentDeps());
  return (
    <RequestShell title={t("consentTitle")}>
      <noscript>
        <p>{t("noScript")}</p>
      </noscript>
      <AssistantConsent
        locale={locale}
        authorizationId={String(authorizationId)}
        initial={initial}
        authFailed={auth === "failed"}
      />
    </RequestShell>
  );
}
