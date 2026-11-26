import { protectedResourceMetadata } from "@/mcp/resource";
import { assistantAccessOn, parseServerEnvironment } from "@/lib/server/env";
import { supabasePublicEnv } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

/** Both `/.well-known/oauth-protected-resource` forms rewrite to this route. */
export async function GET(): Promise<Response> {
  if (!assistantAccessOn()) return new Response(null, { status: 404 });
  const { appUrl } = parseServerEnvironment();
  return Response.json(
    protectedResourceMetadata(appUrl, supabasePublicEnv().url),
    { headers: { "cache-control": "public, max-age=300" } },
  );
}
