import postgres from "postgres";

import { createMemoryClient, type MemoryClient } from "@/core/memory/client";
import { forgetPartyMemory } from "@/core/memory/forget";

import {
  isDirectExecution,
  requiredEnvironment,
  safeErrorMessage,
} from "./release-helpers";

/**
 * One-off erase of the AgentCore Memory written for the two synthetic demo
 * parties of the converted household (Familia Vega and The Parkers). Run once
 * against production during the real-use launch; deleted with the demo
 * schema afterwards.
 */
export const SYNTHETIC_HOME_ID = "00000000-0000-4000-8000-000000000001";
export const SYNTHETIC_PARTIES = [
  { name: "Familia Vega", id: "00000000-0000-4000-8000-000000000301" },
  { name: "The Parkers", id: "00000000-0000-4000-8000-000000000302" },
] as const;

export interface ForgottenParty {
  name: string;
  deletedRecords: number;
  deletedEvents: number;
}

export async function forgetSyntheticMemory(
  env: Readonly<Record<string, string | undefined>> = process.env,
  client?: MemoryClient,
): Promise<ForgottenParty[]> {
  const memoryId = requiredEnvironment("MEMORY_ID", env);
  const region = requiredEnvironment("AWS_REGION", env);
  const sql = postgres(requiredEnvironment("DATABASE_URL", env), {
    prepare: false,
    max: 1,
  });
  const memory = client ?? createMemoryClient(region);
  try {
    const forgotten: ForgottenParty[] = [];
    for (const party of SYNTHETIC_PARTIES) {
      const result = await forgetPartyMemory(
        sql,
        SYNTHETIC_HOME_ID,
        party.id,
        memoryId,
        region,
        memory,
      );
      forgotten.push({ name: party.name, ...result });
    }
    return forgotten;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (isDirectExecution(import.meta.url, process.argv[1])) {
  forgetSyntheticMemory()
    .then((forgotten) => {
      for (const party of forgotten) {
        console.log(
          `Forgot ${party.deletedRecords} record(s) and ${party.deletedEvents} event(s) for ${party.name}.`,
        );
      }
    })
    .catch((error: unknown) => {
      console.error(safeErrorMessage(error));
      process.exitCode = 1;
    });
}
