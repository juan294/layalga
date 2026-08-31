export interface WebMcpInputSchema {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties: false;
}

export interface WebMcpTool {
  name: string;
  title: string;
  description: string;
  inputSchema: WebMcpInputSchema;
  annotations: {
    readOnlyHint: boolean;
    untrustedContentHint: boolean;
  };
  execute: (input: Record<string, unknown>) => Promise<unknown>;
}

export interface ModelContextLike {
  registerTool: (
    tool: WebMcpTool,
    options?: { signal?: AbortSignal },
  ) => Promise<unknown> | unknown;
}

export interface DocumentWithModelContext {
  modelContext?: ModelContextLike;
}

declare global {
  interface Document {
    modelContext?: ModelContextLike;
  }
}
