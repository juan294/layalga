import { SEASONS, type Season } from "@/lib/season";
import { labelStyle, quietButtonStyle, teal } from "./host-styles";
import styles from "./today-hero.module.css";

/* Presentational: the page resolves the season, formats the date, and
   translates every label, the same contract as RoomLedger and HubCards. */
export function TodayHero({
  locale,
  season,
  eyebrow,
  title,
  welcomeLabel,
  dateSeasonLabel,
  signOutLabel,
}: {
  locale: string;
  season: Season;
  eyebrow: string;
  title: string;
  welcomeLabel: string;
  dateSeasonLabel: string;
  signOutLabel: string;
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
          <span className={styles.date}>{dateSeasonLabel}</span>
          {/* Full --interactive-target height, not the mock's compact 36px:
              this repo's touch-safety sweep (tests/e2e/mobile-tap-targets)
              only grandfathers the locale switcher as a sub-44px control. */}
          <form action="/auth/sign-out" className={styles.signOut} method="post">
            <input name="locale" type="hidden" value={locale} />
            <button style={quietButtonStyle} type="submit">
              {signOutLabel}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
