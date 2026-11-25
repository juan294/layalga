import { drizzle } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";

import * as schema from "./schema";

export function createDatabase(connectionString: string) {
  const sql = postgres(connectionString, {
    prepare: false,
    max: 4,
    // Supavisor before 2.10 can hang on queries pipelined outside a transaction.
    max_pipeline: 1,
    ...(process.env.NODE_ENV === "development" ? { idle_timeout: 15 } : {}),
  });

  return {
    db: drizzle(sql, { schema }),
    sql,
  };
}

export type DatabaseConnection = ReturnType<typeof createDatabase>;
export type AppDatabase = DatabaseConnection["db"];
export type Database = AppDatabase;
export type SqlClient = DatabaseConnection["sql"];
export type DatabaseClient = Sql | { $client: Sql };

export function sqlClient(database: DatabaseClient): Sql {
  return "$client" in database ? database.$client : database;
}

let singleton: DatabaseConnection | undefined;

// Development route reloads share a pool only for the exact configured target.
function developmentPools() {
  const runtime = globalThis as typeof globalThis & {
    layalgaDevelopmentPools?: Map<string, DatabaseConnection>;
  };
  return (runtime.layalgaDevelopmentPools ??= new Map());
}

function getDatabaseUrl(): string {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  return validateRuntimeDatabaseUrl(connectionString);
}

export function validateRuntimeDatabaseUrl(connectionString: string): string {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL");
  }

  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must be a PostgreSQL URL");
  }

  const localHost =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "::1" ||
    url.hostname === "[::1]";
  let username: string;
  try {
    username = decodeURIComponent(url.username).toLowerCase();
  } catch {
    throw new Error("DATABASE_URL must contain a valid PostgreSQL username");
  }
  const ownerRole = username === "postgres" || username.startsWith("postgres.");
  if (!localHost && ownerRole) {
    throw new Error(
      "DATABASE_URL must use a dedicated non-owner role for remote runtime access",
    );
  }

  return connectionString;
}

export function getDatabaseConnection(): DatabaseConnection {
  if (process.env.NODE_ENV !== "development")
    return (singleton ??= createDatabase(getDatabaseUrl()));
  const url = getDatabaseUrl();
  const pools = developmentPools();
  const cached = pools.get(url);
  if (cached) return cached;
  const connection = createDatabase(url);
  pools.set(url, connection);
  return connection;
}

export function getDatabase(): AppDatabase {
  return getDatabaseConnection().db;
}

export async function closeDatabase(): Promise<void> {
  let connection = singleton;
  if (process.env.NODE_ENV === "development") {
    const url = process.env.DATABASE_URL;
    if (!url) return;
    const pools = developmentPools();
    connection = pools.get(url);
    pools.delete(url);
  } else {
    singleton = undefined;
  }
  if (connection) await connection.sql.end({ timeout: 5 });
}
