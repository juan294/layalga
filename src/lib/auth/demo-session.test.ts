import { describe, expect, it } from "vitest";

import {
  createDemoHostCookie,
  readDemoHostCookie,
  readDemoHostSession,
} from "./demo-session";

const secret = "a-secure-demo-session-secret-with-32-bytes";
const hostId = "00000000-0000-4000-8000-000000000201";
const now = Date.parse("2026-09-07T08:00:00Z");
const sessionId = "00000000-0000-4000-8000-000000000203";

describe("demo host session", () => {
  it("accepts an untampered token for twelve hours", () => {
    const token = createDemoHostCookie(hostId, { now, secret, sessionId });

    expect(readDemoHostCookie(token, { now: now + 1, secret })).toBe(hostId);
    expect(
      readDemoHostCookie(token, { now: now + 12 * 60 * 60 * 1_000, secret }),
    ).toBeNull();
    expect(readDemoHostSession(token, { now: now + 1, secret })).toMatchObject({
      hostId,
      sessionId,
    });
  });

  it("rejects a modified token", () => {
    const token = createDemoHostCookie(hostId, { now, secret });
    const modified = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;

    expect(readDemoHostCookie(modified, { now, secret })).toBeNull();
  });
});
