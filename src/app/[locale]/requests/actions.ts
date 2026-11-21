"use server";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { after } from "next/server";
import { z } from "zod";
import { resolvePublicStaySelection } from "@/core/booking/public-stay-search";
import { stayRequestInput } from "@/core/booking/stay-requests-input";
import {
  findSubmittedStayRequest,
  submitStayRequest,
  withdrawStayRequest,
} from "@/core/booking/stay-requests";
import { getDatabaseConnection } from "@/core/db/client";
import { SystemClock } from "@/core/clock";
import { dispatchHostEmailPingsSafely } from "@/core/notifications/email-outbox";
import {
  DRAFT_BROWSER_COOKIE,
  DRAFT_SECONDS,
  readStayDraft,
  sealStayDraft,
} from "@/lib/auth/stay-request-draft";
import { verifiedGoogleGuestEmail } from "@/lib/auth/verified-guest-email";
import { createClient } from "@/lib/supabase/server";

async function verifiedRequester() {
  const {
    data: { user },
  } = await (await createClient()).auth.getUser();
  const email = verifiedGoogleGuestEmail(user);
  return user && email ? { userId: user.id, email } : null;
}
async function draftForBrowser(token: unknown) {
  return readStayDraft(
    token,
    (await cookies()).get(DRAFT_BROWSER_COOKIE)?.value,
  );
}

export async function prepareStayRequest(raw: unknown) {
  const parsed = stayRequestInput.safeParse(raw);
  if (!parsed.success) return { status: "invalid" } as const;
  const input = parsed.data;
  try {
    const selected = await resolvePublicStaySelection(
      input.handle,
      input.criteria,
      input.roomRefs,
      input.overflowConsent,
    );
    if (!selected) return { status: "stale" } as const;
    const jar = await cookies();
    const browser =
      jar.get(DRAFT_BROWSER_COOKIE)?.value ??
      randomBytes(32).toString("base64url");
    jar.set(DRAFT_BROWSER_COOKIE, browser, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: DRAFT_SECONDS,
    });
    return { status: "ready", token: sealStayDraft(input, browser) } as const;
  } catch {
    return { status: "unavailable" } as const;
  }
}

export async function reviewStayRequest(token: unknown) {
  try {
    const input = await draftForBrowser(token);
    if (!input) return { status: "expired" } as const;
    const requester = await verifiedRequester();
    if (requester) {
      const prior = await findSubmittedStayRequest(requester.userId, input);
      if (prior) return prior;
    }
    const terms = await resolvePublicStaySelection(
      input.handle,
      input.criteria,
      input.roomRefs,
      input.overflowConsent,
    );
    if (!terms) return { status: "stale" } as const;
    return {
      status: "ready",
      displayName: terms.displayName,
      rooms: terms.rooms,
      handle: input.handle,
      stay: [input.criteria.from, input.criteria.to],
      adults: input.criteria.adults,
      children: input.criteria.children,
      pets: input.criteria.pets,
      overflowConsent: input.overflowConsent,
      notes: input.notes,
      requests: input.requests,
    } as const;
  } catch {
    return { status: "unavailable" } as const;
  }
}

export async function sendStayRequest(token: unknown, reviewedAccount: string) {
  try {
    const input = await draftForBrowser(token);
    if (!input) return { status: "expired" } as const;
    const requester = await verifiedRequester();
    if (!requester) return { status: "sign_in" } as const;
    if (requester.email !== reviewedAccount)
      return { status: "changed_account" } as const;
    const outcome = await submitStayRequest(requester, input);
    if (outcome.status === "pending" || outcome.status === "replayed") {
      try {
        after(() =>
          dispatchHostEmailPingsSafely(
            getDatabaseConnection().db,
            new SystemClock(),
          ),
        );
      } catch {
        // The scheduled tick also processes unsent pings. The committed
        // receipt remains authoritative even if this opportunistic dispatch fails.
        console.error("[STAY_REQUEST_PING_DISPATCH_UNAVAILABLE]");
      }
    }
    return outcome;
  } catch {
    // The same sealed key can recover a persisted request after a lost response.
    return { status: "unavailable" } as const;
  }
}

export async function withdrawMyRequest(id: string) {
  if (!z.uuid().safeParse(id).success) return "missing" as const;
  try {
    const requester = await verifiedRequester();
    if (!requester) return "sign_in" as const;
    const record = await withdrawStayRequest(requester.userId, id);
    return record?.status ?? "missing";
  } catch {
    return "unavailable" as const;
  }
}
