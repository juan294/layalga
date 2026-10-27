"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { useTranslations } from "next-intl";

const STORAGE_KEY = "layalga-theme";
const CHANGE_EVENT = "layalga-theme-change";
const OPTIONS = ["auto", "light", "dark"] as const;
type ThemeOption = (typeof OPTIONS)[number];
let pageChoice: ThemeOption | undefined;

const ICON_PATHS: Record<ThemeOption, ReactNode> = {
  auto: (
    <>
      <rect height="13" rx="1.5" width="18" x="3" y="4" />
      <path d="M12 17v3M8 20h8" />
    </>
  ),
  light: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.5M12 19v2.5M2.5 12h2.5M19 12h2.5M5.2 5.2l1.8 1.8M17 17l1.8 1.8M18.8 5.2 17 7M7 17l-1.8 1.8" />
    </>
  ),
  dark: <path d="M20 13.5A8 8 0 0 1 10.5 4 8 8 0 1 0 20 13.5Z" />,
};

function isStoredTheme(value: string | null): value is "light" | "dark" {
  return value === "light" || value === "dark";
}

function subscribe(callback: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== STORAGE_KEY) return;
    pageChoice = undefined;
    callback();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

function getSnapshot(): string | null {
  if (pageChoice !== undefined) return pageChoice;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function getServerSnapshot(): string | null {
  return null;
}

function next(option: ThemeOption): ThemeOption {
  return OPTIONS[(OPTIONS.indexOf(option) + 1) % OPTIONS.length];
}

function choose(option: ThemeOption) {
  pageChoice = option;
  try {
    if (option === "auto") window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, option);
  } catch {
    // The in-page choice still works when persistence is unavailable.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function ThemeSwitcher() {
  const t = useTranslations("ThemeSwitcher");
  const stored = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const selected: ThemeOption = isStoredTheme(stored) ? stored : "auto";

  useEffect(() => {
    // Always stamp data-theme -- never remove it. html[data-theme="auto"]
    // is what globals.css now scopes the system-dark block under (design-
    // sync cannot register a bare :not([data-theme="light"]) selector).
    document.documentElement.dataset.theme = selected;
  }, [selected]);

  const cycleLabel = t("cycleLabel", { state: t(selected) });

  return (
    <div className="theme-switcher">
      <button
        aria-label={cycleLabel}
        onClick={() => choose(next(selected))}
        title={cycleLabel}
        type="button"
      >
        <svg
          aria-hidden="true"
          fill="none"
          height="18"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
          viewBox="0 0 24 24"
          width="18"
        >
          {ICON_PATHS[selected]}
        </svg>
      </button>
    </div>
  );
}
