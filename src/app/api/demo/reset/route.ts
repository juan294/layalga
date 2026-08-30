import { NextResponse } from "next/server";
import { z } from "zod";

import { getDatabaseConnection } from "@/core/db/client";
import {
  acquireDemoMutationLease,
  authorizeDemoMutation,
} from "@/lib/auth/demo-mutation";

import { DEMO_SEED, seedDemo } from "../../../../../scripts/seed-demo";

const resetInput = z.object({
  homeId: z.uuid(),
});

export async function POST(request: Request): Promise<NextResponse> {
  if (process.env.DEMO_MODE !== "true") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const parsed = resetInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success || parsed.data.homeId !== DEMO_SEED.home.id) {
    return NextResponse.json({ error: "invalid_demo_home" }, { status: 400 });
  }

  const authorization = await authorizeDemoMutation(
    request,
    parsed.data.homeId,
    "reset",
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
    const { sql } = getDatabaseConnection();
    const [home] = await sql<{ id: string }[]>`
      select id from public.homes
      where id = ${parsed.data.homeId} and demo = true
    `;
    if (!home) {
      return NextResponse.json(
        { error: "demo_home_not_found" },
        { status: 404 },
      );
    }

    const databaseUrl = process.env.DATABASE_URL;
    const tokenSecret = process.env.LINK_TOKEN_SECRET;
    if (!databaseUrl || !tokenSecret) {
      return NextResponse.json(
        { error: "server_configuration" },
        { status: 500 },
      );
    }

    const result = await seedDemo(databaseUrl, tokenSecret);
    return NextResponse.json({ ...result, now: DEMO_SEED.clock.start });
  } finally {
    await releaseLease();
  }
}
