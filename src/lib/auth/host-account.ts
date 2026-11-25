import { sqlClient, type DatabaseClient } from "@/core/db/client";

import { normalizeHostEmail } from "./host-emails";

/**
 * True for a bound host and for an email prepared for one. The access token
 * hook applies the same rule in SQL.
 */
export async function isHostAccount(
  database: DatabaseClient,
  userId: string,
  email: string | null,
): Promise<boolean> {
  const [row] = await sqlClient(database)<{ host: boolean }[]>`
    select exists (select 1 from public.hosts where auth_user_id = ${userId})
      or exists (
        select 1 from public.host_identity_claims
        where normalized_email = ${normalizeHostEmail(email ?? undefined)}
      ) as host
  `;
  return row?.host ?? true;
}
