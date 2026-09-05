import { NextResponse } from "next/server";

import { getAgentClient } from "@/agent/client";
import { DbDemoClock } from "@/core/clock";
import { getDatabaseConnection } from "@/core/db/client";
import {
  advanceDemoClock,
  demoClockInput,
  DemoClockError,
} from "@/core/demo/advance-clock";
import { dispatchHostEmailPingsSafely } from "@/core/notifications/email-outbox";
import { runDueJobs } from "@/core/reconfirmation/jobs";
import {
  acquireDemoMutationLease,
  authorizeDemoMutation,
} from "@/lib/auth/demo-mutation";

export async function POST(request: Request): Promise<NextResponse> {
  if (process.env.DEMO_MODE !== "true") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const parsed = demoClockInput.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_clock" }, { status: 400 });
  }

  const authorization = await authorizeDemoMutation(
    request,
    parsed.data.homeId,
    "clock",
  );
  if (!authorization.authorized) {
    const status = authorization.reason === "rate_limit" ? 429 : 403;
    return NextResponse.json({ error: authorization.reason }, { status });
  }
  const releaseLease = await acquireDemoMutationLease(
    parsed.data.homeId,
    authorization.sessionId,
  );
  if (!releaseLease) {
    return NextResponse.json({ error: "demo_busy" }, { status: 409 });
  }

  try {
    const connection = getDatabaseConnection();
    const result = await advanceDemoClock(connection.db, parsed.data);
    const clock = await DbDemoClock.load(parsed.data.homeId, connection.db);
    const jobs =
      result.outcome === "no_eligible"
        ? []
        : await runDueJobs(
            connection.db,
            clock,
            getAgentClient(),
            parsed.data.homeId,
          );
    if (result.outcome !== "no_eligible") {
      await dispatchHostEmailPingsSafely(connection.db, clock);
    }
    const notifications = await connection.sql<
      {
        id: string;
        recipient_kind: "host" | "party";
        recipient_id: string;
        visit_id: string | null;
        kind: string;
        body_en: string;
        body_es: string;
        created_at: Date | string;
      }[]
    >`
    select id, recipient_kind, recipient_id, visit_id, kind, body_en, body_es,
      created_at
    from public.notifications
    where home_id = ${parsed.data.homeId}
    order by created_at, id
  `;

    return NextResponse.json({
      now: clock.now().toISOString(),
      outcome: result.outcome,
      jobs,
      notifications: notifications.map((notification) => ({
        ...notification,
        created_at: new Date(notification.created_at).toISOString(),
      })),
    });
  } catch (error) {
    if (error instanceof DemoClockError) {
      return NextResponse.json(
        { error: error.code },
        {
          status:
            error.code === "demo_home_not_found"
              ? 404
              : error.code === "backward_clock"
                ? 409
                : 400,
        },
      );
    }
    throw error;
  } finally {
    await releaseLease();
  }
}
