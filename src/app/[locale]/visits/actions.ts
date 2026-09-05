"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { schedulerForHome } from "@/agent/scheduler";
import { CancellationChangedError } from "@/core/booking/cancellation-error";
import { withdrawInvitation } from "@/core/booking/cancellation";
import { cancellationReviewInput } from "@/core/booking/cancellation-input";
import { getDatabaseConnection } from "@/core/db/client";
import { partyIsClaimedByUser } from "@/lib/auth/guest-account";
import { createClient } from "@/lib/supabase/server";

export async function cancelAccountVisit(formData: FormData): Promise<void> {
  const locale = formData.get("locale") === "es" ? "es" : "en";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const review = cancellationReviewInput(formData);
  const invitationId = z.uuid().safeParse(formData.get("invitationId"));
  const parsed = z.uuid().safeParse(review.expectedVisitId);
  if (!parsed.success && !invitationId.success) return;
  const connection = getDatabaseConnection();
  const [visit] = invitationId.success
    ? await connection.sql<
        {
          home_id: string;
          invitation_id: string;
          party_id: string;
          demo: boolean;
        }[]
      >`
        select i.home_id, i.id as invitation_id, i.party_id, h.demo from public.invitations i
        join public.homes h on h.id = i.home_id where i.id = ${invitationId.data}
      `
    : await connection.sql<
        {
          home_id: string;
          invitation_id: string;
          party_id: string;
          demo: boolean;
        }[]
      >`
        select v.home_id, v.invitation_id, v.party_id, h.demo from public.visits v
        join public.homes h on h.id = v.home_id where v.id = ${parsed.success ? parsed.data : null}
      `;
  if (!visit || !(await partyIsClaimedByUser(visit.party_id, user.id))) return;
  try {
    await withdrawInvitation(
      connection.db,
      {
        homeId: visit.home_id,
        invitationId: visit.invitation_id,
        actor: { kind: "guest", partyId: visit.party_id },
        ...review,
      },
      schedulerForHome({ homeDemo: visit.demo }),
    );
  } catch (error) {
    if (error instanceof CancellationChangedError) {
      // A pending invitation may have acquired its first visit during review;
      // route to whichever review actually exists after reloading the account.
      const [current] = await connection.sql<{ id: string }[]>`
        select id from public.visits where invitation_id = ${visit.invitation_id}
          and home_id = ${visit.home_id} and status <> 'cancelled'
        order by created_at desc limit 1
      `;
      redirect(
        current
          ? `/${locale}/visits?cancel=changed&visit=${current.id}#cancel-${current.id}`
          : `/${locale}/visits?cancel=changed&invitation=${visit.invitation_id}#cancel-${visit.invitation_id}`,
      );
    }
    throw error;
  }

  redirect(`/${locale}/cancellation-complete`);
}
