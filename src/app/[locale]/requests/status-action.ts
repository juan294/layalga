"use server";

import { getRequesterStayRequest } from "@/core/booking/stay-requests";
import { verifiedRequester } from "@/lib/auth/verified-requester";

export async function readOwnRequestStatus(id: string) {
  try {
    const requester = await verifiedRequester();
    if (!requester) return { status: "sign_in" } as const;
    const receipt = await getRequesterStayRequest(requester.userId, id);
    if (!receipt) return { status: "not_found" } as const;
    return { status: receipt.status, visitStatus: receipt.visitStatus };
  } catch {
    return { status: "unavailable" } as const;
  }
}
