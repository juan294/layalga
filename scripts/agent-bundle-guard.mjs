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
