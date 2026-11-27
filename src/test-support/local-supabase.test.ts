import { afterEach, expect, test, vi } from "vitest";

import { localSupabase } from "./local-supabase";

afterEach(() => vi.unstubAllEnvs());

test("refuses a database whose host query parameter points elsewhere", () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54621");
  vi.stubEnv(
    "DATABASE_URL",
    "postgresql://postgres:postgres@127.0.0.1:54622/postgres?host=db.example.test",
  );
  expect(() => localSupabase()).toThrow(
    "These fixtures require local Supabase",
  );
});

test("accepts the default local stack", () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54621");
  vi.stubEnv(
    "DATABASE_URL",
    "postgresql://postgres:postgres@127.0.0.1:54622/postgres",
  );
  expect(localSupabase().databaseUrl).toContain("127.0.0.1:54622");
});
