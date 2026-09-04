"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";

const STORAGE_KEY = "layalga-theme";
const CHANGE_EVENT = "layalga-theme-change";
const OPTIONS = ["auto", "light", "dark"] as const;
type ThemeOption = (typeof OPTIONS)[number];

function isStoredTheme(value: string | null): value is "light" | "dark" {
  return value === "light" || value === "dark";
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

function getSnapshot(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function getServerSnapshot(): string | null {
  return null;
}

function choose(option: ThemeOption) {
  try {
    if (option === "auto") window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, option);
  } catch {
    // localStorage unavailable -- the dataset.theme effect below still
    // applies the choice for this page load, just not future visits.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function ThemeSwitcher() {
  const t = useTranslations("ThemeSwitcher");
  const stored = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const selected: ThemeOption = isStoredTheme(stored) ? stored : "auto";

  useEffect(() => {
    if (selected === "auto") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = selected;
  }, [selected]);

  return (
    <div className="theme-switcher" role="group" aria-label={t("label")}>
      {OPTIONS.map((option) => (
        <button
          key={option}
          aria-pressed={selected === option}
          onClick={() => choose(option)}
          type="button"
        >
          {t(option)}
        </button>
      ))}
    </div>
  );
}
