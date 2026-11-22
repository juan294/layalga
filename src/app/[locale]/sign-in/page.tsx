import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { getAuthUser } from "@/lib/auth/current-user";
import { getCurrentHost } from "@/lib/auth/current-host";
import { hasPartyForUser } from "@/lib/auth/guest-account";
import { verifiedGoogleGuestEmail } from "@/lib/auth/verified-guest-email";
import { isStaySearchPath } from "@/lib/auth/safe-next-path";
import { LocaleSwitcher } from "@/i18n/locale-switcher";
import { routing } from "@/i18n/routing";
import { ThemeSwitcher } from "@/components/theme-switcher";

import { PostcardArt } from "./postcard-art";
import { SignInButton } from "./sign-in-button";

interface SignInPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string; next?: string | string[] }>;
}

export default async function SignInPage({
  params,
  searchParams,
}: SignInPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  const t = await getTranslations({ locale, namespace: "SignIn" });
  const brandT = await getTranslations({ locale, namespace: "Brand" });
  const { error, next } = await searchParams;
  const nextPath =
    typeof next === "string" && isStaySearchPath(next, locale)
      ? next
      : undefined;
  const user = await getAuthUser();
  if (user && verifiedGoogleGuestEmail(user)) {
    if (nextPath) redirect(nextPath);
    if (await getCurrentHost()) redirect(`/${locale}`);
    if (await hasPartyForUser(user.id)) redirect(`/${locale}/visits`);
    redirect(`/${locale}/stays`);
  }
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
          <SignInButton locale={locale} nextPath={nextPath} />
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
          <p>
            <a href={`/${locale}/privacy`}>{t("privacyLink")}</a>
          </p>
        </footer>
      </section>
    </main>
  );
}
