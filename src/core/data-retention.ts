import { sqlClient, type DatabaseClient } from "./db/client";

export interface DataRetentionResult {
  redactedRuns: number;
  deletedSessions: number;
  redactedInvitations: number;
  redactedVisits: number;
  redactedNotifications: number;
  redactedAudits: number;
}

export async function applyDataRetention(
  database: DatabaseClient,
  now = new Date(),
): Promise<DataRetentionResult> {
  const [row] = await sqlClient(database)<{ result: DataRetentionResult }[]>`
    select private.apply_data_retention(${now.toISOString()}) as result
  `;
  if (!row) throw new Error("Data retention did not return a result");
  return row.result;
}
