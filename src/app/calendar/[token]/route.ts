import { loadCalendarFeed } from "@/core/calendar/calendar-feed";
import { calendarEtag, renderICalendar } from "@/core/calendar/ical";
import { getDatabaseConnection } from "@/core/db/client";

export const dynamic = "force-dynamic";

const BASE_HEADERS = {
  "cache-control": "private, no-store",
  "content-disposition": 'inline; filename="layalga.ics"',
  "content-type": "text/calendar; charset=utf-8",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
} as const;

export async function GET(
  request: Request,
  context: RouteContext<"/calendar/[token]">,
): Promise<Response> {
  const { token } = await context.params;
  const secret = process.env.CALENDAR_FEED_SECRET;
  if (!secret) throw new Error("CALENDAR_FEED_SECRET is required");

  const calendar = await loadCalendarFeed(
    getDatabaseConnection().db,
    token,
    secret,
  );
  if (!calendar) return notFound();

  const body = renderICalendar(calendar);
  const etag = calendarEtag(body);
  const headers = { ...BASE_HEADERS, etag };
  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(body, { status: 200, headers });
}

function notFound(): Response {
  return new Response("Not found", {
    status: 404,
    headers: {
      "cache-control": "private, no-store",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    },
  });
}
