"use client";

import { useEffect } from "react";

import { householdSeason } from "@/lib/season";

/**
 * Keeps <html data-season> following the demo clock's calendar date instead
 * of the real one, so a host who advances the clock across a season
 * boundary sees the accent and hero artwork change with it. Runs after
 * SeasonSync, a sibling mounted earlier in the locale layout's tree, so its
 * effect wins; router.refresh() after a clock change re-renders this with a
 * new demoNow and the effect corrects the attribute again.
 */
export function DemoSeasonSync({
  demoNow,
  timeZone,
}: {
  demoNow: string;
  timeZone: string;
}) {
  useEffect(() => {
    document.documentElement.dataset.season = householdSeason(
      demoNow,
      timeZone,
    );
  }, [demoNow, timeZone]);
  return null;
}
