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

function sourcesMatching(pattern: RegExp) {
  return readdirSync("src", { recursive: true, encoding: "utf8" })
    .map((name) => join("src", name))
    .filter((name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name))
    .filter((name) => !name.startsWith(join("src", "test-support")))
    .filter((name) => pattern.test(withoutComments(readFileSync(name, "utf8"))))
    .sort();
}

it("resolves every web user through getSessionUser", () => {
  expect(sourcesMatching(SESSION_READ)).toEqual(ALLOWED);
});

// Auth answers `/user` for a connected client's token too. Only the bearer
// resolver may ask it, after its own checks.
const USER_ENDPOINT = /\/user(?:\?[^`"']*)?[`"']/;

it("recognizes every spelling of the user endpoint", () => {
  for (const source of [
    "fetch(`${issuer}/user`, options)",
    'fetch("https://project.supabase.co/auth/v1/user")',
    "fetch(new URL('/auth/v1/user', url))",
    'const endpoint = base + "/user"; fetch(endpoint)',
    "fetch(`${issuer}/user?fields=id`)",
  ])
    expect(USER_ENDPOINT.test(withoutComments(source)), source).toBe(true);
  for (const source of [
    'import { currentUser } from "@/lib/auth/current-user"',
    "fetch(`${issuer}/users`)",
    "fetch(`${issuer}/user/oauth/grants`)",
  ])
    expect(USER_ENDPOINT.test(withoutComments(source)), source).toBe(false);
});

it("asks Auth for a client token's user only in the bearer resolver", () => {
  expect(sourcesMatching(USER_ENDPOINT)).toEqual([
    "src/lib/auth/assistant-bearer.ts",
  ]);
});
