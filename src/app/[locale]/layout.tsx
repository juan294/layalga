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

// Stamps a forced light/dark override on <html> before first paint, so a
// user whose stored preference disagrees with their OS setting never sees a
// flash of the wrong theme. Absent (or "auto"/removed) leaves the
// prefers-color-scheme media query in globals.css in control.
const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem('layalga-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

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
  return { title: t("title"), description: t("description") };
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

  return (
    <html
      lang={locale}
      data-scroll-behavior="smooth"
      data-season={currentSeason()}
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
              </div>
            </header>
            {children}
          </div>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
