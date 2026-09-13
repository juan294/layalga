import type { Metadata } from "next";
import { Fraunces, Inter, JetBrains_Mono } from "next/font/google";
import { Suspense, type ReactNode } from "react";
import { hasLocale } from "next-intl";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { SeasonSync } from "@/components/season-sync";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { LocaleSwitcher } from "@/i18n/locale-switcher";
import { routing } from "@/i18n/routing";
import { currentSeason } from "@/lib/season";
import { getCurrentGuestInvitation } from "@/lib/auth/current-guest";
import { getCurrentHost } from "@/lib/auth/current-host";
import { buildSiteMetadata } from "@/lib/site-metadata";

// Stamps data-theme on <html> before first paint, so a user whose stored
// preference disagrees with their OS setting never sees a flash of the
// wrong theme. data-theme is always present -- "auto" (the default) follows
// prefers-color-scheme via html[data-theme="auto"] in globals.css; design-
// sync's token scanner cannot register a bare :not([data-theme="light"])
// scope, so "auto" is stamped explicitly rather than left absent. The static
// data-theme="auto" below is the no-JS fallback.
const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem('layalga-theme');document.documentElement.dataset.theme=(t==='light'||t==='dark')?t:'auto'}catch(e){document.documentElement.dataset.theme='auto'}`;

import "../globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return buildSiteMetadata({
    title: t("title"),
    description: t("description"),
    imageAlt: t("socialImageAlt"),
    locale,
  });
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  const messages = await getMessages({ locale });
  const t = await getTranslations({ locale, namespace: "Brand" });
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const [host, guest] = await Promise.all([
    getCurrentHost(),
    getCurrentGuestInvitation(),
  ]);
  const signedIn = Boolean(host || guest);

  return (
    <html
      lang={locale}
      data-scroll-behavior="smooth"
      data-season={currentSeason()}
      data-theme="auto"
    >
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
          nonce={nonce}
        />
      </head>
      <body
        className={`${fraunces.variable} ${inter.variable} ${jetbrainsMono.variable}`}
      >
        <Suspense fallback={null}>
          <SeasonSync />
        </Suspense>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <div className="site-shell">
            <header className="site-header">
              <div className="site-header__mark">
                <span className="site-header__name">{t("name")}</span>
                <span className="site-header__strapline">{t("strapline")}</span>
              </div>
              <div className="site-header__controls">
                <Suspense fallback={null}>
                  <LocaleSwitcher />
                </Suspense>
                <ThemeSwitcher />
                {signedIn ? (
                  <form action="/auth/sign-out" method="post">
                    <input name="locale" type="hidden" value={locale} />
                    <button className="site-header__signout" type="submit">
                      {t("signOut")}
                    </button>
                  </form>
                ) : null}
              </div>
            </header>
            {children}
          </div>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
