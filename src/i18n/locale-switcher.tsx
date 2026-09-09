"use client";

import { useEffect, useRef, useState } from "react";
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
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
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
        aria-expanded={open}
        aria-haspopup="listbox"
        className="locale-switcher__trigger"
        data-testid="locale-switcher-trigger"
        onClick={() => setOpen((value) => !value)}
        title={t("label")}
        type="button"
      >
        {locale.toUpperCase()}{" "}
        <span aria-hidden="true">{open ? "▲" : "▼"}</span>
      </button>
      {open ? (
        <div className="locale-switcher__menu" role="listbox">
          {routing.locales.map((nextLocale) => (
            <Link
              key={nextLocale}
              aria-selected={locale === nextLocale}
              className="locale-switcher__option"
              data-testid={nextLocale === "es" ? "locale-switch-es" : undefined}
              href={localeSwitchHref(pathname, searchParams, nextLocale)}
              locale={nextLocale}
              onClick={() => setOpen(false)}
              role="option"
            >
              <span className="locale-switcher__code">
                {nextLocale.toUpperCase()}
              </span>
              <span className="locale-switcher__name">— {t(nextLocale)}</span>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
