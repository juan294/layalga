import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { getDatabaseConnection } from "@/core/db/client";
import { LocaleSwitcher } from "@/i18n/locale-switcher";
import { routing } from "@/i18n/routing";

import { PostcardArt } from "./postcard-art";
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
  const brandT = await getTranslations({ locale, namespace: "Brand" });
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
    <main className="postcard">
      <Suspense fallback={<div className="postcard__art" />}>
        <PostcardArt />
      </Suspense>
      <section className="postcard__panel" aria-labelledby="sign-in-title">
        <div className="postcard__topline">
          <span className="postcard__wordmark">{brandT("name")}</span>
          <LocaleSwitcher />
        </div>
        <p className="postcard__tagline">{t("tagline")}</p>
        <h1 id="sign-in-title">{t("title")}</h1>
        <p className="postcard__lead">{t("description")}</p>
        <div className="postcard__actions">
          <SignInButton locale={locale} />
          {demoHosts.map((host) => (
            <form action={`/${locale}/demo-enter`} key={host.id} method="post">
              <input name="hostId" type="hidden" value={host.id} />
              <button
                className="postcard__button postcard__button--secondary"
                data-testid={`demo-enter-${host.display_name.toLowerCase()}`}
                type="submit"
              >
                {demoT("enterAs", { name: host.display_name })}
              </button>
            </form>
          ))}
          {callbackError ? (
            <p className="postcard__error" role="alert">
              {callbackError}
            </p>
          ) : null}
        </div>
        <p className="postcard__note">{t("privacyNote")}</p>
        <footer className="postcard__footer">
          <p>
            {t("footerLead")}
            <a href="https://paisaxe.es/" rel="noopener" target="_blank">
              paisaxe.es
            </a>
          </p>
        </footer>
      </section>
    </main>
  );
}
