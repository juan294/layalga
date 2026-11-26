import { SystemClock } from "@/core/clock";
import { getDatabaseConnection } from "@/core/db/client";
import { resolveAssistant } from "@/lib/auth/assistant-bearer";
import { assistantAccessOn, parseServerEnvironment } from "@/lib/server/env";
import { supabasePublicEnv } from "@/lib/supabase/env";
import { serveMcp, type McpDeps } from "@/mcp/server";

export const dynamic = "force-dynamic";

function liveDeps(): McpDeps {
  const { appUrl } = parseServerEnvironment();
  const supabase = supabasePublicEnv();
  return {
    appUrl,
    resolve: (authorization) =>
      resolveAssistant(authorization, {
        database: getDatabaseConnection().db,
        clock: new SystemClock(),
        supabase,
      }),
  };
}

/** Everything answers 404 while ASSISTANT_ACCESS is not `on`. */
async function endpoint(request: Request): Promise<Response> {
  if (!assistantAccessOn()) return new Response(null, { status: 404 });
  return serveMcp(request, liveDeps());
}

export const GET = endpoint;
export const POST = endpoint;
export const DELETE = endpoint;
