import { NextResponse } from "next/server";
import { z } from "zod";

import { getAgentClient } from "@/agent/client";
import { DbDemoClock } from "@/core/clock";
import { getDatabaseConnection } from "@/core/db/client";
import { runDueJobs } from "@/core/reconfirmation/jobs";
import {
  acquireDemoMutationLease,
  authorizeDemoMutation,
} from "@/lib/auth/demo-mutation";

const clockInput = z.object({
  homeId: z.uuid(),
  now: z.iso.datetime({ offset: true }),
});

export async function POST(request: Request): Promise<NextResponse> {
  if (process.env.DEMO_MODE !== "true") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const parsed = clockInput.safeParse(await request.json().catch(() => null));
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
    const [clockRow] = await connection.sql<{ home_id: string }[]>`
    insert into public.demo_clock (home_id, now, enabled)
    select id, ${new Date(parsed.data.now).toISOString()}, true
    from public.homes
    where id = ${parsed.data.homeId} and demo = true
    on conflict (home_id) do update
    set now = excluded.now, enabled = true
    returning home_id
  `;
    if (!clockRow) {
      return NextResponse.json(
        { error: "demo_home_not_found" },
        { status: 404 },
      );
    }

    const clock = await DbDemoClock.load(parsed.data.homeId, connection.db);
    const jobs = await runDueJobs(
      connection.db,
      clock,
      getAgentClient(),
      parsed.data.homeId,
    );
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
      jobs,
      notifications: notifications.map((notification) => ({
        ...notification,
        created_at: new Date(notification.created_at).toISOString(),
      })),
    });
  } finally {
    await releaseLease();
  }
}
