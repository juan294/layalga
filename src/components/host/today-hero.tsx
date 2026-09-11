import { SEASONS, type Season } from "@/lib/season";
import { labelStyle, teal } from "./host-styles";
import styles from "./today-hero.module.css";

/* Presentational: the page resolves the season, formats the date, and
   translates every label, the same contract as RoomLedger and HubCards.
   Guest pages reuse this hero with a status stamp in place of the date --
   see stampLabel, added for the signed-in shell unification. */
export function TodayHero({
  season,
  eyebrow,
  title,
  welcomeLabel,
  dateSeasonLabel,
  stampLabel,
}: {
  season: Season;
  eyebrow: string;
  title: string;
  welcomeLabel: string;
  dateSeasonLabel?: string;
  stampLabel?: string;
}) {
  return (
    <div className={styles.hero} data-testid="today-hero">
      {SEASONS.map((s) => (
        <picture key={s}>
          <source srcSet={`/landing/house-${s}.webp`} type="image/webp" />
          <img
            alt=""
            className={s === season ? `${styles.img} ${styles.on}` : styles.img}
            src={`/landing/house-${s}.jpg`}
          />
        </picture>
      ))}
      <div className={styles.veil} />
      <div className={styles.inner}>
        <p className={styles.eyebrow} style={{ ...labelStyle, color: teal }}>
          {eyebrow}
        </p>
        <h1 className={styles.title}>{title}</h1>
        <div className={styles.who}>
          <span>{welcomeLabel}</span>
          {dateSeasonLabel ? (
            <span className={styles.date}>{dateSeasonLabel}</span>
          ) : null}
          {stampLabel ? (
            <span className={styles.stamp} data-testid="today-hero-stamp">
              {stampLabel}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
