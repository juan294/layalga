import { z } from "zod";

type Environment = Readonly<Record<string, string | undefined>>;

const agentRuntimeSchema = z.enum(["local", "agentcore"]);
const modelSchema = z.enum(["scripted", "bedrock"]);
const schedulerSchema = z.enum(["none", "eventbridge"]);

const rawEnvironmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).optional(),
  VERCEL_ENV: z.enum(["development", "preview", "production"]).optional(),
  AGENT_RUNTIME: z.string().optional(),
  AGENT_EXECUTION_RUNTIME: z.string().optional(),
  MODEL: z.string().optional(),
  SCHEDULER: z.string().optional(),
  APP_URL: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
  LINK_TOKEN_SECRET: z.string().optional(),
  CALENDAR_FEED_SECRET: z.string().optional(),
  AGENT_ROUTE_SECRET: z.string().optional(),
  CRON_SECRET: z.string().optional(),
  AGENTCORE_RUNTIME_ARN: z.string().optional(),
  BEDROCK_MODEL_ID: z.string().optional(),
  AWS_REGION: z.string().optional(),
  SCHEDULER_ROLE_ARN: z.string().optional(),
  SCHEDULER_DLQ_ARN: z.string().optional(),
});

export interface ServerEnvironment {
  production: boolean;
  /**
   * True inside the AgentCore container process itself (distinguished by
   * `AGENT_EXECUTION_RUNTIME=agentcore`), as opposed to the Vercel web app.
   * The agent process validates a narrower production contract: it never
   * dispatches to itself and carries none of the web app's own secrets.
   */
  agentProcess: boolean;
  agentRuntime: z.infer<typeof agentRuntimeSchema>;
  model: z.infer<typeof modelSchema>;
  scheduler: z.infer<typeof schedulerSchema>;
  appUrl: string;
  agentcoreRuntimeArn?: string;
  bedrockModelId?: string;
  awsRegion?: string;
  schedulerRoleArn?: string;
  schedulerDlqArn?: string;
}

export interface EnvironmentIssue {
  key: string;
  code: "invalid" | "missing";
}

export interface EnvironmentReadiness {
  ready: boolean;
  issues: EnvironmentIssue[];
}

export function parseServerEnvironment(
  environment: Environment = process.env,
): ServerEnvironment {
  const raw = rawEnvironmentSchema.parse(environment);
  const production =
    raw.VERCEL_ENV === "production" || raw.NODE_ENV === "production";
  const agentProcess = parseAgentProcessFlag(raw.AGENT_EXECUTION_RUNTIME);
  // The AgentCore container runs with NODE_ENV=production but is not the web
  // app: it never dispatches to itself and carries none of the web app's own
  // secrets, so only this narrower slice of the production contract applies.
  const productionWebContract = production && !agentProcess;

  const agentRuntime = parseMode(
    agentRuntimeSchema,
    raw.AGENT_RUNTIME,
    productionWebContract ? undefined : "local",
    "AGENT_RUNTIME",
  );
  const model = parseMode(
    modelSchema,
    raw.MODEL,
    production ? undefined : "scripted",
    "MODEL",
  );
  const scheduler = parseMode(
    schedulerSchema,
    raw.SCHEDULER,
    productionWebContract ? undefined : "none",
    "SCHEDULER",
  );
  const appUrl = requiredValue(
    raw.APP_URL,
    production ? undefined : "http://localhost:3008",
    "APP_URL",
  );
  const parsedAppUrl = z.url().safeParse(appUrl);
  if (!parsedAppUrl.success || (production && !appUrl.startsWith("https://"))) {
    throw fieldError("APP_URL", "Invalid production application URL");
  }

  if (production) {
    requireLength(raw.DATABASE_URL, 1, "DATABASE_URL");
    requireLength(raw.LINK_TOKEN_SECRET, 32, "LINK_TOKEN_SECRET");
    requireUrl(raw.DATABASE_URL, "DATABASE_URL");
  }
  if (productionWebContract) {
    for (const [key, value, minimum] of [
      ["NEXT_PUBLIC_SUPABASE_URL", raw.NEXT_PUBLIC_SUPABASE_URL, 1],
      [
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
        raw.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
        1,
      ],
      ["CALENDAR_FEED_SECRET", raw.CALENDAR_FEED_SECRET, 32],
      ["AGENT_ROUTE_SECRET", raw.AGENT_ROUTE_SECRET, 32],
      ["CRON_SECRET", raw.CRON_SECRET, 32],
    ] as const) {
      requireLength(value, minimum, key);
    }
    requireHttpsUrl(raw.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL");
  }

  const needsAws = agentRuntime === "agentcore" || model === "bedrock";
  if (needsAws) {
    requireLength(raw.AWS_REGION, 1, "AWS_REGION");
  }
  if (agentRuntime === "agentcore") {
    requireLength(raw.AGENTCORE_RUNTIME_ARN, 1, "AGENTCORE_RUNTIME_ARN");
  }
  if (model === "bedrock") {
    requireLength(raw.BEDROCK_MODEL_ID, 1, "BEDROCK_MODEL_ID");
  }
  if (scheduler === "eventbridge") {
    requireLength(raw.AGENTCORE_RUNTIME_ARN, 1, "AGENTCORE_RUNTIME_ARN");
    requireLength(raw.AWS_REGION, 1, "AWS_REGION");
    requireLength(raw.SCHEDULER_ROLE_ARN, 1, "SCHEDULER_ROLE_ARN");
    requireLength(raw.SCHEDULER_DLQ_ARN, 1, "SCHEDULER_DLQ_ARN");
  }

  return {
    production,
    agentProcess,
    agentRuntime,
    model,
    scheduler,
    appUrl,
    agentcoreRuntimeArn: raw.AGENTCORE_RUNTIME_ARN,
    bedrockModelId: raw.BEDROCK_MODEL_ID,
    awsRegion: raw.AWS_REGION,
    schedulerRoleArn: raw.SCHEDULER_ROLE_ARN,
    schedulerDlqArn: raw.SCHEDULER_DLQ_ARN,
  };
}

export function serverEnvironmentReadiness(
  environment: Environment = process.env,
): EnvironmentReadiness {
  const raw = rawEnvironmentSchema.safeParse(environment);
  if (!raw.success) {
    return {
      ready: false,
      issues: raw.error.issues.map((issue) => ({
        key: String(issue.path[0] ?? "SERVER_ENV"),
        code: "invalid",
      })),
    };
  }
  const values = raw.data;
  const production =
    values.VERCEL_ENV === "production" || values.NODE_ENV === "production";
  const issues = new Map<string, EnvironmentIssue>();
  const add = (key: string, code: EnvironmentIssue["code"]) =>
    issues.set(key, { key, code });

  let agentProcess = false;
  if (values.AGENT_EXECUTION_RUNTIME) {
    if (values.AGENT_EXECUTION_RUNTIME === "agentcore") agentProcess = true;
    else add("AGENT_EXECUTION_RUNTIME", "invalid");
  }
  // See parseServerEnvironment: the AgentCore container process validates a
  // narrower production contract than the web app.
  const productionWebContract = production && !agentProcess;

  const mode = <T extends string>(
    key: string,
    value: string | undefined,
    allowed: readonly T[],
    fallback: T,
    requireExplicit: boolean,
  ): T | undefined => {
    const candidate = value ?? (requireExplicit ? undefined : fallback);
    if (!candidate) {
      add(key, "missing");
      return undefined;
    }
    if (!allowed.includes(candidate as T)) {
      add(key, "invalid");
      return undefined;
    }
    return candidate as T;
  };
  const agentRuntime = mode(
    "AGENT_RUNTIME",
    values.AGENT_RUNTIME,
    agentRuntimeSchema.options,
    "local",
    productionWebContract,
  );
  const model = mode(
    "MODEL",
    values.MODEL,
    modelSchema.options,
    "scripted",
    production,
  );
  const scheduler = mode(
    "SCHEDULER",
    values.SCHEDULER,
    schedulerSchema.options,
    "none",
    productionWebContract,
  );
  const appUrl =
    values.APP_URL ?? (production ? undefined : "http://localhost:3008");
  if (!appUrl) add("APP_URL", "missing");
  else if (
    !z.url().safeParse(appUrl).success ||
    (production && !appUrl.startsWith("https://"))
  ) {
    add("APP_URL", "invalid");
  }
  const require = (key: keyof typeof values, minimum = 1) => {
    const value = values[key];
    if (!value) add(key, "missing");
    else if (value.length < minimum) add(key, "invalid");
  };
  if (production) {
    require("DATABASE_URL");
    require("LINK_TOKEN_SECRET", 32);
    if (
      values.DATABASE_URL &&
      !z.url().safeParse(values.DATABASE_URL).success
    ) {
      add("DATABASE_URL", "invalid");
    }
  }
  if (productionWebContract) {
    require("NEXT_PUBLIC_SUPABASE_URL");
    require("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
    require("CALENDAR_FEED_SECRET", 32);
    require("AGENT_ROUTE_SECRET", 32);
    require("CRON_SECRET", 32);
    if (
      values.NEXT_PUBLIC_SUPABASE_URL &&
      (!z.url().safeParse(values.NEXT_PUBLIC_SUPABASE_URL).success ||
        !values.NEXT_PUBLIC_SUPABASE_URL.startsWith("https://"))
    ) {
      add("NEXT_PUBLIC_SUPABASE_URL", "invalid");
    }
  }
  if (agentRuntime === "agentcore") require("AGENTCORE_RUNTIME_ARN");
  if (model === "bedrock") require("BEDROCK_MODEL_ID");
  if (agentRuntime === "agentcore" || model === "bedrock")
    require("AWS_REGION");
  if (scheduler === "eventbridge") {
    require("AGENTCORE_RUNTIME_ARN");
    require("AWS_REGION");
    require("SCHEDULER_ROLE_ARN");
    require("SCHEDULER_DLQ_ARN");
  }
  return { ready: issues.size === 0, issues: [...issues.values()] };
}

/**
 * `AGENT_EXECUTION_RUNTIME` selects the agent-process profile. Unset or
 * empty means "not the agent process"; any value other than "agentcore" is
 * a configuration mistake, not an unrecognized mode.
 */
function parseAgentProcessFlag(value: string | undefined): boolean {
  if (!value) return false;
  if (value !== "agentcore") {
    throw fieldError("AGENT_EXECUTION_RUNTIME", "Invalid enum value");
  }
  return true;
}

function parseMode<T extends z.ZodType<string>>(
  schema: T,
  value: string | undefined,
  fallback: z.infer<T> | undefined,
  key: string,
): z.infer<T> {
  const candidate = value ?? fallback;
  if (candidate === undefined) throw fieldError(key, "Required");
  const parsed = schema.safeParse(candidate);
  if (!parsed.success) throw fieldError(key, "Invalid enum value");
  return parsed.data as z.infer<T>;
}

function requiredValue(
  value: string | undefined,
  fallback: string | undefined,
  key: string,
): string {
  const candidate = value ?? fallback;
  if (!candidate) throw fieldError(key, "Required");
  return candidate;
}

function requireLength(
  value: string | undefined,
  minimum: number,
  key: string,
): void {
  if (!value) throw fieldError(key, "Required");
  if (value.length < minimum) throw fieldError(key, "Invalid value");
}

function requireUrl(value: string | undefined, key: string): void {
  if (value && !z.url().safeParse(value).success) {
    throw fieldError(key, "Invalid URL");
  }
}

function requireHttpsUrl(value: string | undefined, key: string): void {
  if (
    value &&
    (!z.url().safeParse(value).success || !value.startsWith("https://"))
  ) {
    throw fieldError(key, "Invalid HTTPS URL");
  }
}

function fieldError(key: string, message: string): z.ZodError {
  return new z.ZodError([
    { code: "custom", path: [key], message, input: undefined },
  ]);
}
