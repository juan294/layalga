# Phase 1 — Demo-guest session primitives `[batch-eligible]`

No dependency on phase 2. No file overlap with any other phase.

## Files

- `src/lib/auth/demo-session.ts` (edit)
- `src/lib/auth/demo-session.test.ts` (edit)
- `src/lib/auth/current-guest.ts` (new)
- `src/lib/auth/current-guest.test.ts` (new)

## Step 1 — Red: guest cookie tests

Add to `demo-session.test.ts`, mirroring the existing host `describe` block
(lines 14-34), a new block for the guest cookie:

```
describe("demo guest session", () => {
  const invitationId = "00000000-0000-4000-8000-000000000402";

  it("accepts an untampered token for twelve hours", () => {
    token = createDemoGuestCookie(invitationId, { now, secret, sessionId });
    expect(readDemoGuestCookie(token, { now: now + 1, secret })).toBe(invitationId);
    expect(readDemoGuestCookie(token, { now: now + 12h, secret })).toBeNull();
    expect(readDemoGuestSession(token, { now: now + 1, secret }))
      .toMatchObject({ invitationId, sessionId });
  });

  it("rejects a modified token", () => {
    token = createDemoGuestCookie(invitationId, { now, secret });
    modified = flip last char;
    expect(readDemoGuestCookie(modified, { now, secret })).toBeNull();
  });
});
```

Run `pnpm run test -- demo-session` — confirm it fails (functions don't exist yet).

## Step 2 — Green: implement the guest cookie

In `demo-session.ts`, add alongside the existing host exports (reuse the
private `signature`/`validSecret` helpers already in the file — do not
duplicate them):

```
export const DEMO_GUEST_COOKIE = "layalga_demo_guest";
export const DEMO_GUEST_MAX_AGE = 12 * 60 * 60; // same 12h window as host

export interface DemoGuestSessionPayload {
  invitationId: string;
  sessionId: string;
  expiresAt: number;
}

export function createDemoGuestCookie(invitationId, options = {}): string {
  // identical structure to createDemoHostCookie, payload = { invitationId, sessionId, expiresAt }
}

export function readDemoGuestCookie(token, options = {}): string | null {
  return readDemoGuestSession(token, options)?.invitationId ?? null;
}

export function readDemoGuestSession(token, options = {}): DemoGuestSessionPayload | null {
  // identical structure to readDemoHostSession, validating
  // typeof payload.invitationId === "string" instead of hostId
}
```

Run the test again — green.

## Step 3 — Red: `getCurrentGuestInvitation` tests

New file `current-guest.test.ts`, following the mocking pattern used
elsewhere for `getCurrentHost`-style resolvers (check
`src/lib/auth/current-host.ts` for any existing test sibling; if none exists,
mock `next/headers` cookies() and `@/core/db/client` directly, following the
`vi.mock` style in `g/[token]/actions.test.ts:11-29`).

Cases to cover:
- Returns `null` when `process.env.DEMO_MODE !== "true"`, even with a valid cookie.
- Returns `null` when no cookie is present.
- Returns `null` when the cookie's `invitationId` does not belong to a
  `homes.demo = true` home (simulates a tampered/foreign id).
- Returns the resolved `{invitationId, homeId, partyId, partyLocale}` when the
  cookie is valid and the invitation belongs to a demo home.

Run — confirm failure (module doesn't exist).

## Step 4 — Green: implement `current-guest.ts`

```
import "server-only";
import { cookies } from "next/headers";
import { getDatabaseConnection } from "@/core/db/client";
import { DEMO_GUEST_COOKIE, readDemoGuestCookie } from "./demo-session";

export interface GuestInvitationRecord {
  invitationId: string;
  homeId: string;
  partyId: string;
  partyLocale: "en" | "es";
}

export async function getCurrentGuestInvitation(): Promise<GuestInvitationRecord | null> {
  if (process.env.DEMO_MODE !== "true") return null;

  const cookieStore = await cookies();
  const invitationId = readDemoGuestCookie(cookieStore.get(DEMO_GUEST_COOKIE)?.value);
  return invitationId ? findDemoGuestInvitationById(invitationId) : null;
}

async function findDemoGuestInvitationById(invitationId: string): Promise<GuestInvitationRecord | null> {
  const sql = getDatabaseConnection().sql;
  const [row] = await sql<{ home_id: string; party_id: string; locale: "en" | "es" }[]>`
    select invitation.home_id, invitation.party_id, party.locale
    from public.invitations as invitation
    join public.parties as party on party.id = invitation.party_id
    join public.homes as home on home.id = invitation.home_id
    where invitation.id = ${invitationId} and home.demo = true
  `;
  return row
    ? { invitationId, homeId: row.home_id, partyId: row.party_id, partyLocale: row.locale }
    : null;
}
```

Run — green.

## Automated success criteria

- `pnpm run typecheck ; pnpm run lint ; pnpm run test` all pass.
- New tests in `demo-session.test.ts` and `current-guest.test.ts` pass and
  fail-first history is followed (red before green).

## Manual success criteria

None — pure library code, covered by unit tests.
