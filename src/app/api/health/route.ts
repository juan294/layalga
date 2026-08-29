import postgres from "postgres";

export const dynamic = "force-dynamic";

type HealthStatus = "ok" | "degraded";

function healthResponse(status: HealthStatus) {
  return Response.json(
    {
      status,
      commit: process.env.VERCEL_GIT_COMMIT_SHA,
    },
    { status: status === "ok" ? 200 : 503 },
  );
}

export async function GET() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error("[TABLE_FALLBACK] DATABASE_URL is not configured");
    return healthResponse("degraded");
  }

  const sql = postgres(databaseUrl, { prepare: false, max: 1 });

  try {
    await sql`select 1`;

    try {
      await sql`select count(*)::int as count from homes`;
    } catch (error) {
      console.error("[TABLE_FALLBACK] homes table is inaccessible", error);
      return healthResponse("degraded");
    }

    return healthResponse("ok");
  } catch (error) {
    console.error("[TABLE_FALLBACK] database health check failed", error);
    return healthResponse("degraded");
  } finally {
    await sql.end({ timeout: 1 });
  }
}
