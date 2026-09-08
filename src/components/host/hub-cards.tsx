import { headingStyle, labelStyle } from "./host-styles";
import styles from "./hub-cards.module.css";

export interface HubCard {
  href: string;
  eyebrow: string;
  title: string;
  status: string;
}

/* Presentational, like RoomLedger and PendingDecisions: every string arrives
   already translated, and each status line is real data from the page that
   renders this -- see the Today overview for the counts behind them. */
export function HubCards({
  cards,
  openLabel,
}: {
  cards: readonly HubCard[];
  openLabel: string;
}) {
  return (
    <div className={styles.hub} data-testid="hub-cards">
      {cards.map((card) => (
        <a
          className={styles.card}
          data-testid="hub-card"
          href={card.href}
          key={card.href}
        >
          <p style={labelStyle}>{card.eyebrow}</p>
          <h3 style={{ ...headingStyle, fontSize: "1.25rem", margin: "0.3rem 0 0" }}>
            {card.title}
          </h3>
          <p className={styles.status}>{card.status}</p>
          <div className={styles.open}>{openLabel}</div>
        </a>
      ))}
    </div>
  );
}
