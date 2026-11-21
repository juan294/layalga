"use server";

import { z } from "zod";
import { decideRequestedStay } from "@/core/booking/decide-stay-request";
import { getCurrentHost } from "@/lib/auth/current-host";

export async function decideStay(
  requestId: string,
  reviewedVersion: number,
  form: FormData,
) {
  const answers = form instanceof FormData ? form.getAll("answer") : [];
  const [answer] = answers;
  if (
    !z.uuid().safeParse(requestId).success ||
    !Number.isSafeInteger(reviewedVersion) ||
    reviewedVersion < 1 ||
    answers.length !== 1 ||
    (answer !== "confirm" && answer !== "decline")
  )
    return { status: "invalid" } as const;
  try {
    const host = await getCurrentHost();
    if (!host) return { status: "sign_in" } as const;
    const outcome = await decideRequestedStay(
      { id: host.id, homeId: host.homeId },
      requestId,
      reviewedVersion,
      answer,
    );
    return {
      status: outcome.status,
      currentStatus: outcome.currentStatus,
      actor: outcome.decidedByName,
    };
  } catch {
    return { status: "unavailable" } as const;
  }
}
