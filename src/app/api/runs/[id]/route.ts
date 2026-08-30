import { NextResponse } from "next/server";
import { z } from "zod";

import { getAuthorizedRunSnapshot } from "../run-data";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const parsed = z.uuid().safeParse((await context.params).id);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_run" }, { status: 400 });
  }

  const token = new URL(request.url).searchParams.get("token") ?? undefined;
  const run = await getAuthorizedRunSnapshot(parsed.data, token);
  if (!run) {
    return NextResponse.json({ error: "run_not_found" }, { status: 404 });
  }

  return NextResponse.json(run, {
    headers: { "cache-control": "no-store" },
  });
}
