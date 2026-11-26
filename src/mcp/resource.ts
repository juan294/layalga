import { assistantEndpoint } from "@/core/assistant-access/audience";
import { issuerOf } from "@/lib/auth/assistant-bearer";

export const ASSISTANT_SCOPE = "openid";

const origin = (appUrl: string) => appUrl.replace(/\/+$/, "");

/** The path-inserted discovery location of the endpoint (RFC 9728). */
export function metadataUrl(appUrl: string): string {
  return `${origin(appUrl)}/.well-known/oauth-protected-resource/api/mcp`;
}

/** Exactly one authorization server: Claude uses only the first. */
export function protectedResourceMetadata(appUrl: string, supabaseUrl: string) {
  return {
    resource: assistantEndpoint(appUrl),
    authorization_servers: [issuerOf(supabaseUrl)],
    scopes_supported: [ASSISTANT_SCOPE],
    bearer_methods_supported: ["header"],
    resource_name: "L’Ayalga",
    resource_documentation: `${origin(appUrl)}/en/privacy`,
  };
}

/**
 * The `WWW-Authenticate` value of every 401. Each refusal is `invalid_token`,
 * never `insufficient_scope`, which would start a step-up that cannot succeed.
 */
export function bearerChallenge(appUrl: string, tokenSent: boolean): string {
  const parts = [
    `resource_metadata="${metadataUrl(appUrl)}"`,
    `scope="${ASSISTANT_SCOPE}"`,
  ];
  if (tokenSent)
    parts.push(
      'error="invalid_token"',
      'error_description="The access token is not valid. Connect again."',
    );
  return `Bearer ${parts.join(", ")}`;
}
