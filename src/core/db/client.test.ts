import { describe, expect, it, vi } from "vitest";

import {
  closeDatabase,
  createDatabase,
  getDatabaseConnection,
  validateRuntimeDatabaseUrl,
} from "./client";

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

  it("rejects malformed URLs and malformed encoded usernames", () => {
    expect(() => validateRuntimeDatabaseUrl("not a URL")).toThrow(
      "valid PostgreSQL URL",
    );
    expect(() =>
      validateRuntimeDatabaseUrl("postgresql://%zz:secret@127.0.0.1/postgres"),
    ).toThrow("valid PostgreSQL username");
  });

  it("reuses the development pool across route reloads and releases idle sockets", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DATABASE_URL", "postgresql://postgres@127.0.0.1:1/postgres");
    const first = getDatabaseConnection();
    try {
      vi.resetModules();
      const reloaded = await import("./client");
      try {
        expect(reloaded.getDatabaseConnection() === first).toBe(true);
        expect(first.sql.options.idle_timeout).toBe(15);
        vi.stubEnv(
          "DATABASE_URL",
          "postgresql://postgres@127.0.0.1:2/postgres",
        );
        expect(reloaded.getDatabaseConnection() === first).toBe(false);
        await reloaded.closeDatabase();
        vi.stubEnv("DATABASE_URL", "bad");
        expect(() => reloaded.getDatabaseConnection()).toThrow(
          "valid PostgreSQL URL",
        );
        vi.stubEnv(
          "DATABASE_URL",
          "postgresql://postgres@127.0.0.1:1/postgres",
        );
      } finally {
        await reloaded.closeDatabase();
      }
    } finally {
      await closeDatabase();
      vi.unstubAllEnvs();
    }
  });

  it("lazily creates and closes the shared database connection", async () => {
    const previous = process.env.DATABASE_URL;
    process.env.DATABASE_URL =
      "postgresql://postgres:postgres@127.0.0.1:54622/postgres";
    try {
      const first = getDatabaseConnection();
      expect(getDatabaseConnection()).toBe(first);
      await closeDatabase();
      await closeDatabase();
    } finally {
      if (previous === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previous;
    }
  });
});

describe("transaction pooler compatibility", () => {
  it("sends one query at a time on each pooled connection", async () => {
    const { sql } = createDatabase(
      "postgresql://postgres:postgres@127.0.0.1:54622/postgres",
    );
    expect(sql.options.max_pipeline).toBe(1);
    expect(sql.options.prepare).toBe(false);
    await sql.end();
  });
});
