import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { FIXTURE_CALLBACK } from "@/test-support/assistant-oauth";

import { ASSISTANT_AUDIENCE } from "./audience";

// The activation runbook names hosted settings that no code reads. Each one
// must be the hosted name of a setting that the local configuration proves.
const runbook = readFileSync(
  "docs/release/assistant-access-activation.md",
  "utf8",
);
const config = readFileSync("supabase/config.toml", "utf8");
const migration = readFileSync(
  "supabase/migrations/20261125000100_assistant_access.sql",
  "utf8",
);

/** Management API name (UpdateAuthConfigBody) and the local config.toml key. */
const SETTINGS = {
  hook_custom_access_token_enabled: [
    "auth.hook.custom_access_token",
    "enabled",
  ],
  hook_custom_access_token_uri: ["auth.hook.custom_access_token", "uri"],
  oauth_server_enabled: ["auth.oauth_server", "enabled"],
  oauth_server_allow_dynamic_registration: [
    "auth.oauth_server",
    "allow_dynamic_registration",
  ],
  oauth_server_authorization_path: [
    "auth.oauth_server",
    "authorization_url_path",
  ],
} as const;
type Setting = keyof typeof SETTINGS;

/** One value of a TOML table, as a JSON value. Enough for this file's scalars. */
function configValue(table: string, key: string): unknown {
  const body = config.split(`\n[${table}]\n`)[1]?.split(/\n\[/)[0];
  const line = body?.match(new RegExp(`^${key} = (.+)$`, "m"))?.[1];
  if (line === undefined) throw new Error(`config.toml has no ${table}.${key}`);
  return JSON.parse(line);
}

/** Every PATCH body of the runbook: the JSON objects inside `patch_auth`. */
const patches = [
  ...runbook.matchAll(/patch_auth <<'JSON'\n([\s\S]*?)\nJSON\n/g),
].map(([, body]) => JSON.parse(body!) as Partial<Record<Setting, unknown>>);

describe("activation runbook", () => {
  it("names only hosted settings that the local configuration proves", () => {
    const named = new Set(
      runbook.match(/\b(?:hook_custom_access_token|oauth_server)_\w+/g),
    );
    expect([...named].sort()).toEqual(Object.keys(SETTINGS).sort());
    for (const [table, key] of Object.values(SETTINGS))
      expect(() => configValue(table, key)).not.toThrow();
  });

  it("switches the hook on, then the server, and rolls each back", () => {
    expect(patches.map((body) => Object.keys(body))).toEqual([
      ["hook_custom_access_token_enabled", "hook_custom_access_token_uri"],
      ["hook_custom_access_token_enabled"],
      [
        "oauth_server_enabled",
        "oauth_server_allow_dynamic_registration",
        "oauth_server_authorization_path",
      ],
      ["oauth_server_enabled"],
    ]);
    const [hookOn, hookOff, serverOn, serverOff] = patches;
    expect(hookOn!.hook_custom_access_token_enabled).toBe(true);
    expect(hookOff!.hook_custom_access_token_enabled).toBe(false);
    expect(serverOn!.oauth_server_enabled).toBe(true);
    expect(serverOff!.oauth_server_enabled).toBe(false);
    // Every gate has its own section, in order: G3 never precedes G2.
    expect(runbook.match(/^## G\d\b/gm)).toEqual(
      ["G0", "G1", "G2", "G3", "G4", "G5", "G6", "G7"].map((g) => `## ${g}`),
    );
  });

  it("uses the local values of the hook URI, consent path and registration", () => {
    const [hookOn, , serverOn] = patches;
    for (const body of [hookOn!, serverOn!])
      for (const [name, value] of Object.entries(body)) {
        if (name.endsWith("_enabled")) continue;
        const [table, key] = SETTINGS[name as Setting];
        expect(value, name).toEqual(configValue(table, key));
      }
    expect(serverOn!.oauth_server_allow_dynamic_registration).toBe(false);
  });

  it("points the hook at the migration's function and the path at the consent page", () => {
    const uri = configValue("auth.hook.custom_access_token", "uri") as string;
    const [, schema, name] = uri.match(
      /^pg-functions:\/\/postgres\/(\w+)\/(\w+)$/,
    )!;
    expect(migration).toContain(
      `create function ${schema}.${name}(event jsonb)`,
    );
    expect(migration).toContain(
      `grant execute on function ${schema}.${name}(jsonb) to supabase_auth_admin`,
    );
    const path = configValue("auth.oauth_server", "authorization_url_path");
    expect(existsSync(`src/app/[locale]${String(path)}/page.tsx`)).toBe(true);
  });

  it("registers the callback and audience that the code and tests use", () => {
    const callbacks = new Set(
      runbook.match(/https:\/\/claude\.ai\/api\/mcp\/auth_callback\b/g),
    );
    expect([...callbacks]).toEqual([FIXTURE_CALLBACK]);
    expect(runbook).toContain(`"redirect_uris": ["${FIXTURE_CALLBACK}"]`);
    expect(runbook).toContain(`'claude', '${FIXTURE_CALLBACK}', false`);
    expect(runbook).toContain(`\`resource\` \`${ASSISTANT_AUDIENCE}\``);
    expect(migration).toContain(`'aud', '${ASSISTANT_AUDIENCE}'`);
  });

  it("forbids a configuration push and prints no secret", () => {
    const pushes = runbook
      .split("\n")
      .filter((line) => /config push/.test(line));
    expect(pushes.length).toBeGreaterThan(0);
    for (const line of pushes) expect(line).toMatch(/^- Never run/);
    expect(runbook).not.toMatch(/sb_(?:secret|publishable)_\w+/);
    expect(runbook).not.toMatch(/\beyJ[\w-]{10,}/);
    // Each time the secret key is read, it is removed again.
    const reads = runbook.match(/^SB_SECRET="\$\(/gm) ?? [];
    expect(reads.length).toBeGreaterThan(0);
    expect(runbook.match(/^unset SB_SECRET$/gm)).toHaveLength(reads.length);
  });
});
