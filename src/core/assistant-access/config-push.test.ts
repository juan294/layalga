import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { expect, it } from "vitest";

// supabase/config.toml describes local stacks. Pushing it would switch the
// hosted Auth hook and OAuth server on.
const CONFIG_PUSH = /\bconfig\b[^\n;&|]*\bpush\b(?!\.)/;

function filesUnder(directory: string): string[] {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
}

it("recognizes a pushed configuration", () => {
  for (const command of [
    "supabase config push",
    "pnpm dlx supabase@2.116.0 --yes config  push --project-ref ref",
    'execFileSync("supabase", ["config", "push"])',
    "supabase config --project-ref ref push",
  ])
    expect(CONFIG_PUSH.test(command), command).toBe(true);
  expect(CONFIG_PUSH.test("git config push.default simple")).toBe(false);
});

it("never pushes the local Supabase configuration", () => {
  const files = [
    ...[
      "scripts",
      ".github",
      ".githooks",
      ".claude/hooks",
      ".codex/hooks",
    ].flatMap(filesUnder),
    "package.json",
    "vercel.json",
  ];
  expect(files.length).toBeGreaterThan(20);
  expect(
    files.filter((file) => CONFIG_PUSH.test(readFileSync(file, "utf8"))),
  ).toEqual([]);
});
