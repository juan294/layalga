import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vitest";

import { REDIRECT_TARGETS } from "./redirect-targets";

/** `redirect(`/${locale}/a/${id}`)` and `router.push(...)`, also across lines. */
const NAVIGATION =
  /(?:redirect|router\.(?:push|replace))\(\s*`\/\$\{[^}]+\}(\/[^`?#]*)?/g;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)
      ? [path]
      : [];
  });
}

/** `/[locale]/runs/[id]/status` and `/runs/${id}/status` both become `/runs/*\/status`. */
function shape(path: string) {
  return path
    .replace(/^\/\[locale\]/, "")
    .replace(/\$\{[^}]+\}|\[[^\]]+\]/g, "*")
    .replace(/\/$/, "");
}

test("every page that app code redirects to is compiled before the browser tests", () => {
  const found = new Set<string>();
  for (const file of [
    ...sourceFiles("src/app"),
    ...sourceFiles("src/components"),
  ])
    for (const match of readFileSync(file, "utf8").matchAll(NAVIGATION))
      found.add(shape(match[1] ?? ""));
  expect(found.size).toBeGreaterThan(10);
  const warmed = new Set(REDIRECT_TARGETS.map(({ route }) => shape(route)));
  expect([...found].filter((target) => !warmed.has(target)).sort()).toEqual([]);
});

test("each warm-up path is a concrete English URL of its route, with an optional query", () => {
  for (const { route, path } of REDIRECT_TARGETS) {
    const pattern = new RegExp(
      `^${route.replace("[locale]", "en").replace(/\[[^\]]+\]/g, "[^/]+")}(?:\\?[^#]*)?$`,
    );
    expect(path, route).toMatch(pattern);
  }
});
