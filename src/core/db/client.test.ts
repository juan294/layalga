import { describe, expect, it } from "vitest";

import { validateRuntimeDatabaseUrl } from "./client";

describe("runtime database credentials", () => {
  it("rejects a remote Supabase owner credential without printing its secret", () => {
    const connectionString =
      "postgresql://postgres.project-ref:do-not-print@aws-0-us-east-1.pooler.supabase.com:6543/postgres";

    expect(() => validateRuntimeDatabaseUrl(connectionString)).toThrow(
      "dedicated non-owner role",
    );
    try {
      validateRuntimeDatabaseUrl(connectionString);
    } catch (error) {
      expect(String(error)).not.toContain("do-not-print");
    }

    expect(() =>
      validateRuntimeDatabaseUrl(
        "postgresql://%70ostgres:secret@db.example.test/postgres",
      ),
    ).toThrow("dedicated non-owner role");
  });

  it("accepts a dedicated runtime role and local owner credentials", () => {
    expect(() =>
      validateRuntimeDatabaseUrl(
        "postgresql://layalga_web.project-ref:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres",
      ),
    ).not.toThrow();
    expect(() =>
      validateRuntimeDatabaseUrl(
        "postgresql://postgres:postgres@127.0.0.1:54622/postgres",
      ),
    ).not.toThrow();
  });

  it("rejects non-PostgreSQL URLs", () => {
    expect(() =>
      validateRuntimeDatabaseUrl("https://layalga_web:secret@example.test"),
    ).toThrow("PostgreSQL URL");
  });
});
