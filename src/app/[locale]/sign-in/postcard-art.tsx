"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";

import { currentSeason, parseSeason, type Season } from "@/lib/season";

const STAMPS: Record<Season, string> = {
  primavera: "Primavera — praos y ocalitos",
  verano: "Verano — el Cantábrico",
  otono: "Otoño — teja y coral",
  invierno: "Invierno — pizarra",
};

export function PostcardArt() {
  const requested = useSearchParams().get("season");
  const season =
    (requested !== "auto" ? parseSeason(requested) : null) ?? currentSeason();
  const t = useTranslations("SignIn");
  const seasonT = useTranslations("Season");

  return (
    <div className="postcard__art">
      <picture>
        <source srcSet={`/landing/house-${season}.webp`} type="image/webp" />
        <img
          alt={t("imageAlt", { season: seasonT(season) })}
          height={2304}
          src={`/landing/house-${season}.jpg`}
          width={1856}
        />
      </picture>
      <p className="postcard__stamp">{STAMPS[season]} · La casa, Quintes</p>
    </div>
  );
}
