import { drizzle } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";

import * as schema from "./schema";

export function createDatabase(connectionString: string) {
  const sql = postgres(connectionString, {
    prepare: false,
    max: 4,
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

function getDatabaseUrl(): string {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  return connectionString;
}

export function getDatabaseConnection(): DatabaseConnection {
  singleton ??= createDatabase(getDatabaseUrl());
  return singleton;
}

export function getDatabase(): AppDatabase {
  return getDatabaseConnection().db;
}

export async function closeDatabase(): Promise<void> {
  if (!singleton) {
    return;
  }

  const connection = singleton;
  singleton = undefined;
  await connection.sql.end({ timeout: 5 });
}
