import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, it } from "vitest";

// `getUser()` also accepts tokens of connected OAuth clients, and `getSession()`
// verifies nothing. Web code must use getSessionUser. The proxy only refreshes
// cookies.
const ALLOWED = ["src/lib/auth/session-user.ts", "src/lib/supabase/proxy.ts"];

// Any mention counts, so destructuring, aliases, bind and computed access match.
const SESSION_READ = /\bget(User|Claims|Session)\b/;

function withoutComments(source: string) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

it("recognizes every spelling of a direct session read", () => {
  for (const source of [
    "supabase.auth.getUser()",
    "const { getUser } = supabase.auth",
    "client.auth?.getClaims()",
    'auth["getSession"]()',
    "auth.getUser.bind(auth)",
  ])
    expect(SESSION_READ.test(withoutComments(source)), source).toBe(true);
  expect(SESSION_READ.test(withoutComments("await getSessionUser(a)"))).toBe(
    false,
  );
});

it("resolves every web user through getSessionUser", () => {
  const callers = readdirSync("src", { recursive: true, encoding: "utf8" })
    .map((name) => join("src", name))
    .filter((name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name))
    .filter((name) => !name.startsWith(join("src", "test-support")))
    .filter((name) =>
      SESSION_READ.test(withoutComments(readFileSync(name, "utf8"))),
    );
  expect(callers.sort()).toEqual(ALLOWED);
});
