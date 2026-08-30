import { graphite, ink, labelStyle, rule, teal } from "./host-styles";
import { formatDateStay } from "../frontend-utils";
import { StatusChip } from "./status-chip";
import styles from "./calendar-ledger.module.css";

export interface LedgerVisit {
  id: string;
  familyName: string;
  start: string;
  end: string;
  status: string;
  rooms: string[];
}

interface CalendarLedgerProps {
  locale: string;
  month: Date;
  visits: LedgerVisit[];
  statusLabels: Record<string, string>;
  emptyLabel: string;
  roomsLabel: string;
  navigation: {
    previousHref: string;
    previousLabel: string;
    nextHref: string;
    nextLabel: string;
    visitCountLabel: string;
  };
}

export function CalendarLedger({
  locale,
  month,
  visits,
  statusLabels,
  emptyLabel,
  roomsLabel,
  navigation,
}: CalendarLedgerProps) {
  const days = monthDays(month);
  const monthLabel = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(month);

  return (
    <>
      <nav aria-label={monthLabel} className={styles.navigation}>
        <a href={navigation.previousHref}>{navigation.previousLabel}</a>
        <strong>{monthLabel}</strong>
        <a href={navigation.nextHref}>{navigation.nextLabel}</a>
        <span>{navigation.visitCountLabel}</span>
      </nav>
      <div
        aria-hidden="true"
        className={styles.visual}
        data-testid="calendar-visual"
      >
        <div
          style={{
            alignItems: "baseline",
            borderBottom: `2px solid ${ink}`,
            display: "flex",
            justifyContent: "space-between",
            minWidth: "40rem",
            paddingBottom: "0.65rem",
          }}
        >
          <p style={{ ...labelStyle, color: teal }}>{monthLabel}</p>
          <p style={labelStyle}>{navigation.visitCountLabel}</p>
        </div>
        <div style={{ minWidth: "40rem" }}>
          {days.map((day) => {
            const active = visits.filter((visit) => covers(visit, day));
            return (
              <div
                key={day.toISOString()}
                style={{
                  alignItems: "stretch",
                  borderBottom: `1px solid ${rule}`,
                  display: "grid",
                  gridTemplateColumns: "5.25rem 1fr",
                  minHeight: "3.2rem",
                }}
              >
                <div
                  style={{
                    alignItems: "baseline",
                    borderRight: `1px solid ${rule}`,
                    display: "flex",
                    gap: "0.55rem",
                    padding: "0.7rem 0.6rem 0.5rem 0",
                  }}
                >
                  <strong
                    style={{
                      color: ink,
                      fontFamily: "var(--font-fraunces, Georgia, serif)",
                      fontSize: "1.25rem",
                    }}
                  >
                    {day.getUTCDate()}
                  </strong>
                  <span style={{ ...labelStyle, fontSize: "0.75rem" }}>
                    {new Intl.DateTimeFormat(locale, {
                      weekday: "short",
                      timeZone: "UTC",
                    }).format(day)}
                  </span>
                </div>
                <div
                  style={{
                    alignContent: "center",
                    display: "grid",
                    gap: "0.25rem",
                    gridTemplateColumns: `repeat(${Math.max(visits.length, 1)}, minmax(7rem, 1fr))`,
                    padding: "0.32rem 0",
                  }}
                >
                  {active.map((visit) => {
                    const lane = visits.findIndex(
                      (item) => item.id === visit.id,
                    );
                    const begins = visit.start === isoDay(day);
                    return (
                      <div
                        key={visit.id}
                        style={{
                          alignItems: "center",
                          background: "rgba(12, 97, 91, 0.09)",
                          borderBottom: `1px solid ${teal}`,
                          borderLeft: begins
                            ? `4px solid ${teal}`
                            : `1px solid ${teal}`,
                          borderTop: `1px solid ${teal}`,
                          color: ink,
                          display: "flex",
                          gap: "0.55rem",
                          gridColumn: `${lane + 1} / span 1`,
                          marginLeft: `${lane * -0.35}rem`,
                          padding: "0.35rem 0.5rem",
                          position: "relative",
                          zIndex: visits.length - lane,
                        }}
                      >
                        <span
                          style={{
                            flex: 1,
                            fontFamily: "var(--font-inter, Arial, sans-serif)",
                            fontSize: "0.76rem",
                            fontWeight: 750,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {visit.familyName}
                        </span>
                        {begins ? (
                          <StatusChip
                            label={statusLabels[visit.status] ?? visit.status}
                            status={visit.status}
                          />
                        ) : null}
                        <span
                          title={`${roomsLabel}: ${visit.rooms.join(", ")}`}
                          style={{
                            ...labelStyle,
                            color: graphite,
                            fontSize: "0.75rem",
                          }}
                        >
                          {visit.rooms.length}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <section
        aria-label={monthLabel}
        className={styles.agenda}
        data-testid="calendar-agenda"
      >
        {visits.length ? (
          <ol>
            {visits.map((visit) => (
              <li key={visit.id}>
                <strong>{visit.familyName}</strong>
                <time dateTime={`${visit.start}/${visit.end}`}>
                  {formatDateStay([visit.start, visit.end], locale)}
                </time>
                <small>{statusLabels[visit.status] ?? visit.status}</small>
                <p>
                  {roomsLabel}: {visit.rooms.join(", ")}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p>{emptyLabel}</p>
        )}
      </section>
    </>
  );
}

function monthDays(month: Date): Date[] {
  const year = month.getUTCFullYear();
  const index = month.getUTCMonth();
  const count = new Date(Date.UTC(year, index + 1, 0)).getUTCDate();
  return Array.from(
    { length: count },
    (_, day) => new Date(Date.UTC(year, index, day + 1)),
  );
}

function covers(visit: LedgerVisit, day: Date): boolean {
  const value = isoDay(day);
  return visit.start <= value && value < visit.end;
}

function isoDay(day: Date): string {
  return day.toISOString().slice(0, 10);
}
