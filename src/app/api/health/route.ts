import {
  serverEnvironmentReadiness,
  type EnvironmentReadiness,
} from "@/lib/server/env";
import {
  healthStatus,
  checkDatabaseHealth,
  type HealthStatus,
  type OperationsHealth,
} from "./health";

export const dynamic = "force-dynamic";

function healthResponse(
  status: HealthStatus,
  operations?: OperationsHealth,
  configuration?: EnvironmentReadiness,
) {
  return Response.json(
    {
      status,
      commit: process.env.VERCEL_GIT_COMMIT_SHA,
      operations,
      configuration,
    },
    { status: status === "ok" ? 200 : 503 },
  );
}

export async function GET() {
  const configuration = serverEnvironmentReadiness();
  try {
    const operations = await checkDatabaseHealth();
    const status = healthStatus(configuration, operations);
    if (status === "degraded") {
      console.error("[HEALTH_OPERATIONS_DEGRADED]", operations);
    }
    return healthResponse(status, operations, configuration);
  } catch (error) {
    console.error("[HEALTH_DATABASE_FAILED]", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return healthResponse("degraded", undefined, configuration);
  }
}
