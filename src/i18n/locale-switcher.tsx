"use client";

import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";

import { localeSwitchHref } from "@/components/frontend-utils";

import { Link, usePathname } from "./navigation";
import { routing } from "./routing";

export function LocaleSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useTranslations("LocaleSwitcher");
  return (
    <nav className="locale-switcher" aria-label={t("label")}>
      {routing.locales.map((nextLocale) => (
        <Link
          key={nextLocale}
          href={localeSwitchHref(pathname, searchParams, nextLocale)}
          locale={nextLocale}
          aria-current={locale === nextLocale ? "page" : undefined}
          data-testid={nextLocale === "es" ? "locale-switch-es" : undefined}
        >
          {t(nextLocale)}
        </Link>
      ))}
    </nav>
  );
}
