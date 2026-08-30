import { describe, expect, it } from "vitest";

import {
  isAgentRunRequestAuthorized,
  matchesInternalSecret,
} from "./internal-auth";

describe("internal agent authorization", () => {
  const agentSecret = "a".repeat(32);

  it("accepts only the dedicated agent route secret", () => {
    const request = new Request("https://example.test/api/agent/run", {
      headers: { "x-layalga-internal": agentSecret },
    });

    expect(
      isAgentRunRequestAuthorized(request, {
        AGENT_ROUTE_SECRET: agentSecret,
        TICK_SECRET: agentSecret,
      }),
    ).toBe(true);
    expect(
      isAgentRunRequestAuthorized(request, { TICK_SECRET: agentSecret }),
    ).toBe(false);
  });

  it("rejects missing, short, and unequal secrets", () => {
    expect(matchesInternalSecret(null, agentSecret)).toBe(false);
    expect(matchesInternalSecret("short", "short")).toBe(false);
    expect(matchesInternalSecret("b".repeat(32), agentSecret)).toBe(false);
  });
});
