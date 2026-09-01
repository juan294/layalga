import { CalendarLedger } from "layalga";

// Household, rooms and families are the demo seed's own (scripts/seed-demo.ts):
// Casa Ayalga, with Cuartu del Horreu / de la Fonte / del Teixu.
const STATUS_LABELS = {
  hold: "Hold",
  confirmed: "Confirmed",
  reconfirm_pending: "Reconfirm pending",
  reconfirmed: "Reconfirmed",
  escalated: "Escalated",
};

const SEPTEMBER = new Date(Date.UTC(2026, 8, 1));

// The real page builds these hrefs from the ?month= query parameter; a static
// preview card only needs them to be shaped like the real ones.
function navigationFor(visitCount: number) {
  return {
    previousHref: "/en?month=2026-08",
    previousLabel: "Previous month",
    nextHref: "/en?month=2026-10",
    nextLabel: "Next month",
    visitCountLabel:
      visitCount === 0
        ? "No visits this month"
        : visitCount === 1
          ? "1 visit this month"
          : `${visitCount} visits this month`,
  };
}

export function BookedMonth() {
  return (
    <CalendarLedger
      emptyLabel="No visits this month"
      locale="en"
      month={SEPTEMBER}
      navigation={navigationFor(2)}
      roomsLabel="Rooms"
      statusLabels={STATUS_LABELS}
      visits={[
        {
          id: "visit-vega",
          familyName: "Familia Vega",
          start: "2026-09-02",
          end: "2026-09-07",
          status: "reconfirmed",
          rooms: ["Cuartu del Teixu", "Cuartu del Horreu"],
        },
        {
          id: "visit-oteros",
          familyName: "The Oteros",
          start: "2026-09-09",
          end: "2026-09-13",
          status: "reconfirm_pending",
          rooms: ["Cuartu de la Fonte"],
        },
      ]}
    />
  );
}

// Overlapping stays are the conflict the coordinator exists to surface: three
// families share the house across the first half of the month, each visit
// keeping its own lane.
export function OverlappingStays() {
  return (
    <CalendarLedger
      emptyLabel="No visits this month"
      locale="en"
      month={SEPTEMBER}
      navigation={navigationFor(3)}
      roomsLabel="Rooms"
      statusLabels={STATUS_LABELS}
      visits={[
        {
          id: "visit-vega",
          familyName: "Familia Vega",
          start: "2026-09-02",
          end: "2026-09-08",
          status: "confirmed",
          rooms: ["Cuartu del Teixu"],
        },
        {
          id: "visit-oteros",
          familyName: "The Oteros",
          start: "2026-09-05",
          end: "2026-09-11",
          status: "hold",
          rooms: ["Cuartu de la Fonte"],
        },
        {
          id: "visit-prieto",
          familyName: "Casa Prieto",
          start: "2026-09-07",
          end: "2026-09-12",
          status: "escalated",
          rooms: ["Cuartu del Horreu"],
        },
      ]}
    />
  );
}

export function EmptyMonth() {
  return (
    <CalendarLedger
      emptyLabel="No visits this month"
      locale="en"
      month={SEPTEMBER}
      navigation={navigationFor(0)}
      roomsLabel="Rooms"
      statusLabels={STATUS_LABELS}
      visits={[]}
    />
  );
}
