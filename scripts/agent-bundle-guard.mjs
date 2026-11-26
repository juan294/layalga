/**
 * Fails the AgentCore bundle build when any esbuild input path matches.
 *
 * @param {{ inputs: Record<string, unknown> }} metafile
 * @param {(path: string) => boolean} matches
 * @param {string} label
 */
function assertAbsent(metafile, matches, label) {
  const shipped = Object.keys(metafile.inputs).filter(matches);
  if (shipped.length > 0) {
    throw new Error(
      `${label} must not ship in the AgentCore bundle: ${shipped.join(", ")}`,
    );
  }
}

/**
 * The scripted model is test-only. Fails the AgentCore bundle build when any
 * esbuild input path contains `scripted-model`.
 *
 * @param {{ inputs: Record<string, unknown> }} metafile
 */
export function assertNoScriptedModel(metafile) {
  assertAbsent(
    metafile,
    (path) => path.includes("scripted-model"),
    "scripted model",
  );
}

// The assistant endpoint, its route and the bearer resolver run on the web
// only. The agent reads the shared audience constant through env.ts.
// Metafile paths are relative to the working directory, so a dependency with
// a `src/mcp` folder of its own stays outside the pattern.
const ASSISTANT_ENDPOINT =
  /^(?:\.\.\/)*src\/(?:mcp\/|app\/api\/mcp\/|lib\/auth\/assistant-bearer)/;

/**
 * Fails the AgentCore bundle build when any esbuild input belongs to the
 * assistant endpoint.
 *
 * @param {{ inputs: Record<string, unknown> }} metafile
 */
export function assertNoAssistantEndpoint(metafile) {
  assertAbsent(
    metafile,
    (path) => ASSISTANT_ENDPOINT.test(path),
    "assistant endpoint",
  );
}
