import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, it } from "vitest";

// `getUser()` also accepts tokens of connected OAuth clients. Web code must use
// getSessionUser; sign-out only ends the session it finds.
const ALLOWED = [
  "src/app/auth/sign-out/route.ts",
  "src/lib/auth/session-user.ts",
];

it("resolves every web user through getSessionUser", () => {
  const callers = readdirSync("src", { recursive: true, encoding: "utf8" })
    .map((name) => join("src", name))
    .filter((name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name))
    .filter((name) => !name.startsWith(join("src", "test-support")))
    .filter((name) =>
      /\.auth\s*\.\s*getUser\(/.test(
        readFileSync(name, "utf8").replace(/^\s*(\/\/|\/?\*).*$/gm, ""),
      ),
    );
  expect(callers.sort()).toEqual(ALLOWED);
});
