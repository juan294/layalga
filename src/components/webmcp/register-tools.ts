import type { DocumentWithModelContext, WebMcpTool } from "./types";

export function registerWebMcpTools(
  target: DocumentWithModelContext,
  tools: readonly WebMcpTool[],
): () => void {
  if (!target.modelContext) return () => undefined;

  const controller = new AbortController();
  for (const tool of tools) {
    try {
      Promise.resolve(
        target.modelContext.registerTool(tool, { signal: controller.signal }),
      ).catch(() => undefined);
    } catch {
      continue;
    }
  }
  return () => controller.abort();
}
