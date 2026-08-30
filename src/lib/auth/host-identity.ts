import { sqlClient, type DatabaseClient } from "@/core/db/client";

import { normalizeHostEmail } from "./host-emails";

export async function claimHostIdentity(
  database: DatabaseClient,
  authUserId: string,
  email: string | undefined,
): Promise<string | null> {
  const normalizedEmail = normalizeHostEmail(email);
  if (!normalizedEmail) return null;

  return sqlClient(database).begin(async (transaction) => {
    const [claim] = await transaction<
      {
        host_id: string;
        home_id: string;
        auth_user_id: string | null;
      }[]
    >`
      select host_id, home_id, auth_user_id
      from public.host_identity_claims
      where normalized_email = ${normalizedEmail}
      for update
    `;
    if (!claim) return null;
    if (claim.auth_user_id && claim.auth_user_id !== authUserId) {
      throw new Error("Host identity claim conflict");
    }

    const [existingHost] = await transaction<{ id: string }[]>`
      select id
      from public.hosts
      where auth_user_id = ${authUserId}
      for update
    `;
    if (existingHost && existingHost.id !== claim.host_id) {
      throw new Error("Host identity claim conflict");
    }

    const [host] = await transaction<{ id: string }[]>`
      update public.hosts
      set auth_user_id = ${authUserId}
      where id = ${claim.host_id}
        and home_id = ${claim.home_id}
        and (auth_user_id is null or auth_user_id = ${authUserId})
      returning id
    `;
    if (!host) throw new Error("Host identity claim conflict");

    const [claimed] = await transaction<{ host_id: string }[]>`
      update public.host_identity_claims
      set auth_user_id = ${authUserId},
          claimed_at = coalesce(claimed_at, now())
      where normalized_email = ${normalizedEmail}
        and host_id = ${host.id}
        and (auth_user_id is null or auth_user_id = ${authUserId})
      returning host_id
    `;
    if (!claimed) throw new Error("Host identity claim conflict");
    return claimed.host_id;
  });
}
