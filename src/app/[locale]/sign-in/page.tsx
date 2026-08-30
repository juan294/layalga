import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { getDatabaseConnection } from "@/core/db/client";
import { routing } from "@/i18n/routing";

import { SignInButton } from "./sign-in-button";

interface SignInPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string }>;
}

export default async function SignInPage({
  params,
  searchParams,
}: SignInPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  const t = await getTranslations({ locale, namespace: "SignIn" });
  const demoT = await getTranslations({ locale, namespace: "DemoHost" });
  const { error } = await searchParams;
  const callbackError =
    error === "not_a_host" ? t("notHostError") : error ? t("callbackError") : null;
  const demoHosts =
    process.env.DEMO_MODE === "true"
      ? await getDatabaseConnection().sql<{ id: string; display_name: string }[]>`
          select host.id, host.display_name
          from public.hosts as host
          join public.homes as home on home.id = host.home_id
          where home.demo = true
          order by host.created_at, host.id
        `
      : [];

  return (
    <main className="auth-shell">
      <section className="auth-ledger" aria-labelledby="sign-in-title">
        <p className="auth-ledger__folio">{t("folio")}</p>
        <div className="auth-ledger__entry">
          <p className="auth-ledger__eyebrow">{t("eyebrow")}</p>
          <h1 id="sign-in-title">{t("title")}</h1>
          <p>{t("description")}</p>
        </div>
        <div className="auth-ledger__sign-in">
          <SignInButton locale={locale} />
          {demoHosts.map((host) => (
            <form action={`/${locale}/demo-enter`} key={host.id} method="post">
              <input name="hostId" type="hidden" value={host.id} />
              <button
                className="auth-ledger__demo-action"
                data-testid={`demo-enter-${host.display_name.toLowerCase()}`}
                type="submit"
              >
                {demoT("enterAs", { name: host.display_name })}
              </button>
            </form>
          ))}
          {callbackError ? (
            <p className="auth-ledger__error" role="alert">
              {callbackError}
            </p>
          ) : null}
          <p className="auth-ledger__note">{t("privacyNote")}</p>
        </div>
      </section>
    </main>
  );
}
