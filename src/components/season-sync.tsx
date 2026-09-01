"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { currentSeason, parseSeason, type Season } from "@/lib/season";

const OVERRIDE_KEY = "layalga:season";

/**
 * The layout stamps the season on <html> during the server render, but a
 * prerendered page keeps whatever season it was built in. This corrects the
 * attribute once the page is live, and honours a ?season= override so QA and
 * screenshots can pin one season; ?season=auto returns to the date.
 */
export function SeasonSync() {
  const requested = useSearchParams().get("season");

  useEffect(() => {
    document.documentElement.dataset.season =
      readOverride(requested) ?? currentSeason();
  }, [requested]);

  return null;
}

function readOverride(requested: string | null): Season | null {
  try {
    if (requested === "auto") {
      window.sessionStorage.removeItem(OVERRIDE_KEY);
      return null;
    }

    const season = parseSeason(requested);
    if (season) {
      window.sessionStorage.setItem(OVERRIDE_KEY, season);
      return season;
    }

    return parseSeason(window.sessionStorage.getItem(OVERRIDE_KEY));
  } catch {
    return parseSeason(requested);
  }
}
