"use server";

import { z } from "zod";

import {
  issueCalendarFeed,
  revokeCalendarFeed,
} from "@/core/calendar/calendar-feed";
import { getDatabaseConnection } from "@/core/db/client";
import { requireHost } from "@/lib/auth/current-host";
import { reportActionError } from "@/lib/server/action-errors";
import { parseServerEnvironment } from "@/lib/server/env";

export type CalendarFeedActionState =
  | { status: "idle" }
  | { status: "success"; feedId: string; subscriptionUrl: string }
  | { status: "error" };

export async function issueCalendarFeedAction(
  _previous: CalendarFeedActionState,
  formData: FormData,
): Promise<CalendarFeedActionState> {
  const locale = formData.get("locale") === "es" ? "es" : "en";
  const host = await requireHost(locale);
  const label = String(formData.get("label") ?? "").trim();
  const secret = process.env.CALENDAR_FEED_SECRET;
  if (!label || !secret) return { status: "error" };

  try {
    const feed = await issueCalendarFeed(getDatabaseConnection().db, {
      homeId: host.homeId,
      hostId: host.id,
      label,
      locale,
      secret,
    });
    const appUrl = parseServerEnvironment().appUrl.replace(/\/$/, "");
    return {
      status: "success",
      feedId: feed.id,
      subscriptionUrl: `${appUrl}/calendar/${feed.token}`,
    };
  } catch (error) {
    reportActionError("calendar_feed_issue_failed", error);
    return { status: "error" };
  }
}

export async function revokeCalendarFeedAction(
  formData: FormData,
): Promise<void> {
  const locale = formData.get("locale") === "es" ? "es" : "en";
  const host = await requireHost(locale);
  const feedId = z.uuid().safeParse(formData.get("feedId"));
  if (!feedId.success) return;

  try {
    await revokeCalendarFeed(getDatabaseConnection().db, {
      homeId: host.homeId,
      hostId: host.id,
      feedId: feedId.data,
    });
  } catch (error) {
    reportActionError("calendar_feed_revoke_failed", error);
  }
}
