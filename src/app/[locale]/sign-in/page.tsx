import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { LocaleSwitcher } from "@/i18n/locale-switcher";
import { routing } from "@/i18n/routing";
import { ThemeSwitcher } from "@/components/theme-switcher";

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
  const { error } = await searchParams;
  const callbackError =
    error === "not_a_host"
      ? t("notHostError")
      : error
        ? t("callbackError")
        : null;

  return (
    <main className="postcard">
      <Suspense fallback={<div className="postcard__art" />}>
        <PostcardArt />
      </Suspense>
      <section className="postcard__panel" aria-labelledby="sign-in-title">
        <div className="postcard__topline">
          <span className="postcard__wordmark">{brandT("name")}</span>
          <div className="site-header__controls">
            <LocaleSwitcher />
            <ThemeSwitcher />
          </div>
        </div>
        <p className="postcard__tagline">{t("tagline")}</p>
        <h1 id="sign-in-title">{t("title")}</h1>
        <p className="postcard__lead">{t("description")}</p>
        <div className="postcard__actions">
          <SignInButton locale={locale} />
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
