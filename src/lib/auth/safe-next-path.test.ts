import { describe, expect, it } from "vitest";

import {
  assistantConsentPath,
  isAssistantConsentPath,
  isAssistantsPath,
  isAuthorizationId,
} from "./safe-next-path";

const ID = "6qozma2yk5o6zzzh6t7ozzpowz2l4h5t";
const consent = (query: string, locale = "en") =>
  `/${locale}/oauth/consent${query}`;

describe("isAssistantConsentPath", () => {
  it.each([
    consent(`?authorization_id=${ID}`),
    consent(`?authorization_id=${ID}`, "es"),
    consent(`?authorization_id=${"a".repeat(16)}`),
    consent(`?authorization_id=${"Z-_9".repeat(32)}`),
  ])("accepts a consent request: %s", (path) => {
    expect(isAssistantConsentPath(path)).toBe(true);
  });

  it.each([
    ["no request", consent("")],
    ["an empty request", consent("?authorization_id=")],
    ["15 characters", consent(`?authorization_id=${"a".repeat(15)}`)],
    ["129 characters", consent(`?authorization_id=${"a".repeat(129)}`)],
    ["an extra parameter", consent(`?authorization_id=${ID}&next=/en`)],
    ["a leading parameter", consent(`?next=/en&authorization_id=${ID}`)],
    [
      "a duplicate request",
      consent(`?authorization_id=${ID}&authorization_id=${ID}`),
    ],
    ["a fragment", consent(`?authorization_id=${ID}#x`)],
    ["an encoded slash", consent(`?authorization_id=${ID}%2Fadmin`)],
    ["a slash", consent(`?authorization_id=${ID}/admin`)],
    ["a newline at the end", consent(`?authorization_id=${ID}\n`)],
    ["a control character", consent(`?authorization_id=${ID}\u0000`)],
    ["another locale", consent(`?authorization_id=${ID}`, "fr")],
    ["no locale", `/oauth/consent?authorization_id=${ID}`],
    ["a longer route", consent(`/x?authorization_id=${ID}`)],
    ["another host", `//evil.example/en/oauth/consent?authorization_id=${ID}`],
    [
      "an absolute URL",
      `https://evil.example/en/oauth/consent?authorization_id=${ID}`,
    ],
  ])("refuses %s", (_, path) => {
    expect(isAssistantConsentPath(path)).toBe(false);
  });
});

describe("isAssistantsPath", () => {
  it.each(["/en/assistants", "/es/assistants"])("accepts %s", (path) => {
    expect(isAssistantsPath(path)).toBe(true);
  });

  it.each([
    "/assistants",
    "/fr/assistants",
    "/en/assistants/",
    "/en/assistants?x=1",
    "/en/assistants#x",
    "/en/assistants\n",
    "/en/assistants/../rooms",
    "//evil.example/en/assistants",
  ])("refuses %s", (path) => {
    expect(isAssistantsPath(path)).toBe(false);
  });
});

describe("isAuthorizationId", () => {
  it.each([ID, "a".repeat(16), "Z-_9".repeat(32)])("accepts %s", (id) => {
    expect(isAuthorizationId(id)).toBe(true);
    expect(isAssistantConsentPath(assistantConsentPath("es", id))).toBe(true);
  });

  it.each([
    undefined,
    null,
    7,
    [ID],
    "",
    "a".repeat(15),
    "a".repeat(129),
    `${ID}\n`,
    `${ID}/`,
    `${ID}&x=1`,
  ])("refuses %j", (id) => {
    expect(isAuthorizationId(id)).toBe(false);
  });
});
