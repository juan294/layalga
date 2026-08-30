import { readFile } from "node:fs/promises";

import { describe, expect, test } from "vitest";

import { DEMO_SEED, resetDemoHome } from "./reset";

describe("demo reset boundary", () => {
  test("exposes one deterministic synthetic home through a narrow service", () => {
    expect(resetDemoHome).toBeTypeOf("function");
    expect(DEMO_SEED.home).toMatchObject({
      demo: true,
      id: "00000000-0000-4000-8000-000000000001",
      name: "Casa Ayalga",
    });
    expect(new Set(DEMO_SEED.rooms.map(({ id }) => id)).size).toBe(
      DEMO_SEED.rooms.length,
    );
    expect(new Set(DEMO_SEED.parties.map(({ id }) => id)).size).toBe(
      DEMO_SEED.parties.length,
    );
  });

  test("keeps the route on the service boundary and CLI setup in the script", async () => {
    const [route, script] = await Promise.all([
      readFile(
        new URL("../../app/api/demo/reset/route.ts", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../../../scripts/seed-demo.ts", import.meta.url), "utf8"),
    ]);

    expect(route).toContain("@/lib/demo/reset");
    expect(route).not.toContain("scripts/seed-demo");
    expect(script).toContain("@/lib/demo/reset");
    expect(script).toContain("process.env.DATABASE_URL");
    expect(script).toContain("process.env.LINK_TOKEN_SECRET");
  });
});
