import postgres from 'postgres';

import { requireEnv } from './env.js';

export function createDatabase() {
  return postgres(requireEnv('DATABASE_URL'), {
    max: 4,
    prepare: false,
  });
}

export type Database = ReturnType<typeof createDatabase>;
