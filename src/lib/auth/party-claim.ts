import "server-only";

import { findInvitationByToken } from "@/core/booking/invitations";
import { getDatabaseConnection } from "@/core/db/client";

export async function claimPartyForUser(
  token: string,
  authUserId: string,
): Promise<boolean> {
  const connection = getDatabaseConnection();
  const invitation = await findInvitationByToken(connection.db, token);
  if (!invitation) return false;

  const [party] = await connection.sql<{ id: string }[]>`
    update public.parties
    set auth_user_id = ${authUserId}
    where id = ${invitation.partyId}
      and (auth_user_id is null or auth_user_id = ${authUserId})
    returning id
  `;
  return Boolean(party);
}
