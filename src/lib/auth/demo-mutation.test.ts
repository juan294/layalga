import { describe, expect, it } from "vitest";

import { authorizeDemoMutation } from "./demo-mutation";
import { createDemoHostCookie, DEMO_HOST_COOKIE } from "./demo-session";

const secret = "d".repeat(32);
const homeId = "00000000-0000-4000-8000-000000000001";
const hostId = "00000000-0000-4000-8000-000000000002";
const sessionId = "00000000-0000-4000-8000-000000000003";
const allowRate = async () => true;

function request(options: { cookie?: string; origin?: string } = {}): Request {
  const headers = new Headers();
  if (options.cookie) headers.set("cookie", options.cookie);
  if (options.origin) headers.set("origin", options.origin);
  return new Request("http://localhost:3008/api/demo/clock", {
    method: "POST",
    headers,
  });
}

describe("authorizeDemoMutation", () => {
  it("accepts a signed same-home session from the same origin", async () => {
    const cookie = createDemoHostCookie(hostId, {
      secret,
      now: 1_000,
      sessionId,
    });
    const result = await authorizeDemoMutation(
      request({
        cookie: `${DEMO_HOST_COOKIE}=${cookie}`,
        origin: "http://localhost:3008",
      }),
      homeId,
      "clock",
      {
        now: 1_001,
        secret,
        resolveHomeId: async (candidate) =>
          candidate === hostId ? homeId : null,
        consumeRateLimit: allowRate,
      },
    );

    expect(result).toEqual({ authorized: true, hostId, sessionId });
  });

  it("rejects missing, cross-origin, and cross-home authority", async () => {
    const cookie = createDemoHostCookie(hostId, {
      secret,
      now: 1_000,
      sessionId,
    });
    const resolveHomeId = async () => homeId;

    await expect(
      authorizeDemoMutation(request(), homeId, "reset", {
        now: 1_001,
        secret,
        resolveHomeId,
      }),
    ).resolves.toEqual({ authorized: false, reason: "origin" });

    await expect(
      authorizeDemoMutation(
        request({
          cookie: `${DEMO_HOST_COOKIE}=${cookie}`,
          origin: "https://attacker.example",
        }),
        homeId,
        "reset",
        { now: 1_001, secret, resolveHomeId },
      ),
    ).resolves.toEqual({ authorized: false, reason: "origin" });

    await expect(
      authorizeDemoMutation(
        request({
          cookie: `${DEMO_HOST_COOKIE}=${cookie}`,
          origin: "http://localhost:3008",
        }),
        "00000000-0000-4000-8000-000000000099",
        "reset",
        { now: 1_001, secret, resolveHomeId },
      ),
    ).resolves.toEqual({ authorized: false, reason: "scope" });
  });

  it("rate-limits repeated mutations for one signed host", async () => {
    const cookie = createDemoHostCookie(hostId, {
      secret,
      now: 1_000,
      sessionId,
    });
    const demoRequest = request({
      cookie: `${DEMO_HOST_COOKIE}=${cookie}`,
      origin: "http://localhost:3008",
    });
    let count = 0;
    const options = {
      now: 1_001,
      secret,
      resolveHomeId: async () => homeId,
      limit: 2,
      windowMs: 60_000,
      consumeRateLimit: async () => {
        count += 1;
        return count <= 2;
      },
    };

    await expect(
      authorizeDemoMutation(demoRequest, homeId, "reset", options),
    ).resolves.toMatchObject({ authorized: true });
    await expect(
      authorizeDemoMutation(demoRequest, homeId, "reset", options),
    ).resolves.toMatchObject({ authorized: true });
    await expect(
      authorizeDemoMutation(demoRequest, homeId, "reset", options),
    ).resolves.toEqual({ authorized: false, reason: "rate_limit" });
  });
});
