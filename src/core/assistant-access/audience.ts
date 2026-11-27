/** The one protected resource. The access token hook writes the same literal. */
export const ASSISTANT_AUDIENCE =
  "https://layalga.thecreativetoken.com/api/mcp";

export const withoutTrailingSlash = (url: string) => url.replace(/\/+$/, "");

/** The assistant endpoint of an application URL. */
export function assistantEndpoint(appUrl: string): string {
  return `${withoutTrailingSlash(appUrl)}/api/mcp`;
}
