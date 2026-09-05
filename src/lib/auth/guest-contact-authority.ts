import "server-only";
import { z } from "zod";

import {
  findInvitationById,
  findInvitationByToken,
} from "@/core/booking/invitations";
import { getDatabaseConnection } from "@/core/db/client";
import { getCurrentGuestInvitation } from "./current-guest";
import { partyIsClaimedByUser } from "./guest-account";
import { createClient } from "@/lib/supabase/server";
import { verifiedGoogleGuestEmail } from "./verified-guest-email";

export type GuestContactContext =
  | { kind: "token"; token: string }
  | { kind: "session" }
  | { kind: "account"; invitationId: string };

/** Posted IDs are selectors only. Every path resolves fresh invitation ownership. */
export async function resolveGuestContactAuthority(
  context: GuestContactContext,
) {
  const db = getDatabaseConnection().db;
  const {
    data: { user },
  } = await (await createClient()).auth.getUser();
  const invitation =
    context.kind === "token"
      ? await findInvitationByToken(db, context.token)
      : context.kind === "session"
        ? await getCurrentGuestInvitation().then((session) =>
            session ? findInvitationById(db, session.invitationId) : null,
          )
        : context.kind === "account" &&
            z.uuid().safeParse(context.invitationId).success
          ? await findInvitationById(db, context.invitationId)
          : null;
  if (!invitation) return null;
  const claimed = user
    ? await partyIsClaimedByUser(invitation.partyId, user.id)
    : false;
  if (context.kind === "account" && !claimed) return null;
  return {
    authority: {
      invitationId: invitation.id,
      homeId: invitation.homeId,
      partyId: invitation.partyId,
    },
    verifiedEmail: claimed ? verifiedGoogleGuestEmail(user) : null,
  };
}
