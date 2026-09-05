export type BenchmarkActor = "operator" | "host" | "guest";
export type BenchmarkCategory =
  "setup" | "navigation" | "interaction" | "decision" | "demo_clock";
export interface BenchmarkAction {
  name: string;
  actor: BenchmarkActor;
  category: BenchmarkCategory;
  durationMs: number;
  success: boolean;
}

const modes = {
  MODEL: "scripted",
  AGENT_RUNTIME: "local",
  EMAIL: "none",
  MEMORY: "none",
  SCHEDULER: "none",
  DEMO_MODE: "true",
} as const;
const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]);

function localUrl(value: string | undefined, database = false): URL {
  if (!value) throw new Error("Explicit local benchmark URLs are required");
  const url = new URL(value);
  if (
    !loopback.has(url.hostname) ||
    url.search ||
    url.hash ||
    !(database ? ["postgres:", "postgresql:"] : ["http:", "https:"]).includes(
      url.protocol,
    ) ||
    (!database && (url.username || url.password || !/^\/*$/.test(url.pathname)))
  ) {
    throw new Error("Benchmark URLs must use loopback without query overrides");
  }
  return url;
}

export function benchmarkConfiguration(
  env: Readonly<Record<string, string | undefined>>,
) {
  for (const [name, expected] of Object.entries(modes)) {
    if (env[name] !== expected)
      throw new Error(`Benchmark requires ${name}=${expected}`);
  }
  const app = localUrl(env.APP_URL);
  const database = localUrl(env.DATABASE_URL, true);
  const supabase = localUrl(env.NEXT_PUBLIC_SUPABASE_URL);
  return {
    baseUrl: app.origin,
    databaseUrl: database.toString(),
    supabaseUrl: supabase.origin,
    publicConfiguration: {
      baseUrl: app.origin,
      databaseHost: database.hostname,
      supabaseOrigin: supabase.origin,
      model: "scripted" as const,
      agentRuntime: "local" as const,
      email: "none" as const,
      memory: "none" as const,
      scheduler: "none" as const,
      demo: true,
    },
  };
}
export type BenchmarkConfiguration = ReturnType<typeof benchmarkConfiguration>;

export function isBenchmarkRequestAllowed(
  config: BenchmarkConfiguration,
  value: string,
  navigation: boolean,
): boolean {
  try {
    const url = new URL(value);
    return (
      !url.username &&
      !url.password &&
      (url.origin === config.baseUrl ||
        (!navigation && url.origin === config.supabaseUrl))
    );
  } catch {
    return false;
  }
}

export function assertBenchmarkHealth(value: unknown, revision: string): void {
  if (!value || typeof value !== "object")
    throw new Error("Invalid benchmark health");
  const health = value as {
    status?: string;
    commit?: string;
    configuration?: { ready?: boolean };
  };
  if (
    health.status !== "ok" ||
    health.configuration?.ready !== true ||
    health.commit !== revision
  ) {
    throw new Error("Benchmark server health or revision mismatch");
  }
}

export function summarizeBenchmarkActions(actions: readonly BenchmarkAction[]) {
  const byCategory: Record<BenchmarkCategory, number> = {
    setup: 0,
    navigation: 0,
    interaction: 0,
    decision: 0,
    demo_clock: 0,
  };
  const simulatedDecisions = { host: 0, guest: 0 };
  let measuredActionDurationMs = 0;
  for (const action of actions) {
    if (!Number.isFinite(action.durationMs) || action.durationMs < 0)
      throw new Error("Invalid benchmark action duration");
    byCategory[action.category]++;
    if (action.category === "decision" && action.actor !== "operator")
      simulatedDecisions[action.actor]++;
    measuredActionDurationMs += action.durationMs;
  }
  return {
    attempted: actions.length,
    succeeded: actions.filter((action) => action.success).length,
    failed: actions.filter((action) => !action.success).length,
    byCategory,
    simulatedDecisions,
    measuredActionDurationMs: Math.round(measuredActionDurationMs * 100) / 100,
  };
}
