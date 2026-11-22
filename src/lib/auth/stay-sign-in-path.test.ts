import { expect, it } from "vitest";
import { staySignInPath } from "./stay-sign-in-path";

const handle = "d5e0b5a2-5155-4f81-9ab4-05ab2630582f";
function returnTo(entry: string) {
  return new URL(entry, "https://example.invalid").searchParams.get("next");
}

it("restores only the published search terms after Google sign-in", () => {
  expect(
    returnTo(
      staySignInPath("es", undefined, { q: "La casa", notes: "private" }),
    ),
  ).toBe("/es/stays?q=La+casa");
  expect(
    returnTo(
      staySignInPath("en", handle, {
        from: "2031-07-01",
        adults: 2,
        requests: "private",
        pets: ["2", "3"],
      }),
    ),
  ).toBe(`/en/stays/${handle}?from=2031-07-01&adults=2`);
});
it("falls back to the directory when the handle contains another route or query", () => {
  expect(returnTo(staySignInPath("en", handle + "?adults=2", {}))).toBe(
    "/en/stays",
  );
  expect(returnTo(staySignInPath("es", "../requests", {}))).toBe("/es/stays");
});
