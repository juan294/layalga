/**
 * The scripted model is test-only. Fails the AgentCore bundle build when any
 * esbuild input path contains `scripted-model`.
 *
 * @param {{ inputs: Record<string, unknown> }} metafile
 */
export function assertNoScriptedModel(metafile) {
  const shipped = Object.keys(metafile.inputs).filter((path) =>
    path.includes("scripted-model"),
  );
  if (shipped.length > 0) {
    throw new Error(
      `scripted model must not ship in the AgentCore bundle: ${shipped.join(", ")}`,
    );
  }
}

// The assistant endpoint, its route and the bearer resolver run on the web
// only. The agent reads the shared audience constant through env.ts.
const ASSISTANT_ENDPOINT =
  /(^|\/)src\/(mcp\/|app\/api\/mcp\/|lib\/auth\/assistant-bearer)/;

/**
 * Fails the AgentCore bundle build when any esbuild input belongs to the
 * assistant endpoint.
 *
 * @param {{ inputs: Record<string, unknown> }} metafile
 */
export function assertNoAssistantEndpoint(metafile) {
  const shipped = Object.keys(metafile.inputs).filter((path) =>
    ASSISTANT_ENDPOINT.test(path),
  );
  if (shipped.length > 0) {
    throw new Error(
      `assistant endpoint must not ship in the AgentCore bundle: ${shipped.join(", ")}`,
    );
  }
}
