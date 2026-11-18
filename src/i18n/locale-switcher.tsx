"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";

import { localeSwitchHref } from "@/components/frontend-utils";

import { Link, usePathname } from "./navigation";
import { routing } from "./routing";

const MENU_ID = "locale-switcher-menu";

/** Closes the disclosure on Escape and puts focus back on its trigger. */
export function closeOnEscape(
  event: { key: string },
  close: () => void,
  restoreFocus: () => void,
): boolean {
  if (event.key !== "Escape") return false;
  close();
  restoreFocus();
  return true;
}

export function LocaleOptions({
  locale,
  onNavigate,
}: {
  locale: string;
  onNavigate: () => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useTranslations("LocaleSwitcher");

  return (
    <nav aria-label={t("label")} className="locale-switcher__menu" id={MENU_ID}>
      {routing.locales.map((nextLocale) => (
        <Link
          key={nextLocale}
          aria-current={locale === nextLocale ? "true" : undefined}
          className="locale-switcher__option"
          data-testid={nextLocale === "es" ? "locale-switch-es" : undefined}
          href={localeSwitchHref(pathname, searchParams, nextLocale)}
          lang={nextLocale}
          locale={nextLocale}
          onClick={onNavigate}
        >
          <span className="locale-switcher__code">
            {nextLocale.toUpperCase()}
          </span>
          <span className="locale-switcher__name">— {t(nextLocale)}</span>
        </Link>
      ))}
    </nav>
  );
}

export function LocaleSwitcher() {
  const locale = useLocale();
  const t = useTranslations("LocaleSwitcher");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      closeOnEscape(
        event,
        () => setOpen(false),
        () => triggerRef.current?.focus(),
      );
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="locale-switcher" ref={rootRef}>
      <button
        aria-controls={MENU_ID}
        aria-expanded={open}
        className="locale-switcher__trigger"
        data-testid="locale-switcher-trigger"
        onClick={() => setOpen((value) => !value)}
        ref={triggerRef}
        title={t("label")}
        type="button"
      >
        {locale.toUpperCase()}{" "}
        <span aria-hidden="true">{open ? "▲" : "▼"}</span>
      </button>
      {open ? (
        <LocaleOptions locale={locale} onNavigate={() => setOpen(false)} />
      ) : null}
    </div>
  );
}
