# Phase 2 — Guest core extraction `[batch-eligible]`

No dependency on phase 1. No file overlap with phase 1. Depends on nothing;
phase 3 depends on this phase.

## Files

- `src/core/booking/invitations.ts` (edit — add `findInvitationById`)
- `src/app/[locale]/g/[token]/guest-data.ts` → moved to
  `src/core/booking/guest-invitation.ts` (moved + edited)
- `src/app/[locale]/g/[token]/actions.ts` (edit — thin wrappers over new core)
- `src/core/booking/guest-actions.ts` (new — extracted core logic)
- `src/app/[locale]/g/[token]/actions.test.ts` (edit — update mock path, add
  coverage for `requestGuestChange`/`reconfirmGuest`)
- `src/components/guest/guest-invite-form.tsx` (edit — optional token,
  injected actions)
- `src/components/guest/guest-actions.tsx` (edit — optional token, injected
  actions)
- `src/app/[locale]/g/[token]/page.tsx` (edit — pass explicit actions +
  updated import path)

This is a **behavior-preserving refactor** for the token route. Nothing about
`/[locale]/g/[token]` should change externally. Follow red-green-refactor:
add missing coverage first (red/green), then refactor with that coverage as
the safety net (testing.md: "Refactors need existing coverage").

## Step 1 — Red/Green: cover the untested actions first

`actions.test.ts` currently covers `findGuestOptions` and `submitGuestVisit`
only (verified: no `requestGuestChange`/`reconfirmGuest` tests exist). Before
touching the implementation, add tests for both, mocking
`applyGuestReconfirmation` (from `@/core/reconfirmation/apply-guest-answer`)
and `getAgentClient().enqueue`, following the existing mock style
(`vi.hoisted`, `vi.mock("./guest-data", ...)`):

- `requestGuestChange`: enqueues `guest_change` when `visit.status !==
  "reconfirm_pending"`, enqueues `guest_reconfirm` with `answer: "change"`
  when it is, and redirects to the run-status URL with `token` in the query.
- `reconfirmGuest`: calls `applyGuestReconfirmation` with the loaded
  `homeId`/`visitId`/`"yes"`, then redirects to `/${locale}/g/${token}`.

Run — these should pass against the *current* implementation (they're
characterization tests, not new behavior). This is the safety net for the
refactor below.

## Step 2 — `findInvitationById` in `invitations.ts`

Add next to `findInvitationByToken` (`src/core/booking/invitations.ts:194`),
same return shape (`InvitationByToken`), keyed by primary key instead of
token hash:

```
export async function findInvitationById(
  database: DatabaseClient,
  invitationId: string,
): Promise<InvitationByToken | null> {
  const client = sqlClient(database);
  const rows = await client<...>`
    select i.id, i.home_id, i.host_id, i.party_id, p.family_name, p.locale,
           i.raw_message, i.structured, i.status, i.link_token_expires_at
    from public.invitations i
    join public.parties p on p.id = i.party_id
    where i.id = ${invitationId} and i.status <> 'cancelled'
    limit 1
  `;
  // same row -> InvitationByToken mapping as findInvitationByToken
}
```

Note: unlike `findInvitationByToken`, this does not check
`link_token_expires_at` or `link_token_revoked_at` — a demo-guest cookie
session is a distinct trust boundary from the magic link, scoped instead by
`getCurrentGuestInvitation()`'s `homes.demo = true` check (phase 1). Add a
unit test in `invitations.test.ts` (check whether this file exists first; if
not, create it colocated per project convention) mirroring
`findInvitationByToken`'s existing test coverage.

## Step 3 — Relocate and generalize `guest-data.ts`

Move `src/app/[locale]/g/[token]/guest-data.ts` to
`src/core/booking/guest-invitation.ts`. Change the identity parameter on both
exported functions from a bare `token: string` to a discriminated union:

```
export type GuestIdentity =
  | { token: string }
  | { invitationId: string };

export async function resolveGuestInvitationAuthority(
  identity: GuestIdentity,
): Promise<GuestInvitationAuthority | null> {
  const invitation = "token" in identity
    ? await findInvitationByToken(getDatabaseConnection().db, identity.token)
    : await findInvitationById(getDatabaseConnection().db, identity.invitationId);
  return invitation
    ? { id: invitation.id, homeId: invitation.homeId, partyId: invitation.partyId }
    : null;
}

export async function loadGuestInvitation(
  identity: GuestIdentity,
  locale: "en" | "es",
): Promise<GuestInvitationData | null> {
  const connection = getDatabaseConnection();
  const invitation = "token" in identity
    ? await findInvitationByToken(connection.db, identity.token)
    : await findInvitationById(connection.db, identity.invitationId);
  if (!invitation) return null;
  // ...unchanged from here (visit lookup, chase message, mapping)
}
```

`partyDefaults` and the exported types move as-is.

## Step 4 — Extract action core logic into `core/booking/guest-actions.ts`

Move the parts of `actions.ts` that run *after* authority resolution into
pure functions taking an already-resolved authority/invitation, so both the
token route and (in phase 3) the cookie route can share them without forking
business logic:

```
// core/booking/guest-actions.ts

export async function findGuestOptionsForAuthority(
  authority: GuestInvitationAuthority,
  input: ValidatedOptionInput, // { from, to, nights, adults, children, pets }
): Promise<GuestOptionState> {
  // body of current findGuestOptionsForInput, but takes `authority` directly
  // instead of resolving it from input.token
}

export async function submitGuestVisitForAuthority(
  authority: GuestInvitationAuthority,
  input: ValidatedSubmitInput,
): Promise<{ runId: string }> {
  // the getAgentClient().enqueue({ task: "guest_submit", ... }) call,
  // returns { runId } instead of calling redirect() itself —
  // callers build their own route-specific redirect URL
}

export async function requestGuestChangeCore(
  invitation: GuestInvitationData, // from loadGuestInvitation
  message: string,
  locale: "en" | "es",
): Promise<{ runId: string } | null> {
  // the two enqueue branches from requestGuestChange; returns null if
  // !invitation.visit || !message (caller no-ops in that case, matching
  // current behavior of an early `return` with no redirect)
}

export async function reconfirmGuestCore(
  invitation: GuestInvitationData,
): Promise<boolean> {
  // the applyGuestReconfirmation call; returns false if !invitation.visit
  // (caller no-ops, matching current behavior)
}
```

`redirect()` must be called by the route-level action (Next.js requires the
throw to propagate directly out of the Server Action), never inside these
core functions.

## Step 5 — Refactor `g/[token]/actions.ts` into thin wrappers

```
import {
  findGuestOptionsForAuthority,
  submitGuestVisitForAuthority,
  requestGuestChangeCore,
  reconfirmGuestCore,
} from "@/core/booking/guest-actions";
import {
  loadGuestInvitation,
  resolveGuestInvitationAuthority,
} from "@/core/booking/guest-invitation";

export async function findGuestOptions(_previous, formData) {
  const parsed = optionInput.safeParse(...);
  if (!parsed.success || ...) return { status: "error", ... };
  const authority = await resolveGuestInvitationAuthority({ token: parsed.data.token });
  if (!authority) return { status: "error", options: [], error: "not_found" };
  return findGuestOptionsForAuthority(authority, parsed.data);
}

export async function submitGuestVisit(_previous, formData) {
  const parsed = submitInput.safeParse(...);
  if (!parsed.success) return { status: "error", error: "invalid" };
  const authority = await resolveGuestInvitationAuthority({ token: parsed.data.token });
  if (!authority) return { status: "error", error: "not_found" };
  try {
    const { runId } = await submitGuestVisitForAuthority(authority, parsed.data);
    redirect(`/${parsed.data.locale}/runs/${runId}/status?returnTo=${encodeURIComponent(
      `/${parsed.data.locale}/g/${parsed.data.token}`,
    )}&token=${encodeURIComponent(parsed.data.token)}`);
  } catch (error) {
    if (isRedirect(error)) throw error;
    reportActionError("guest_submit_failed", error);
    return { status: "error", error: "failed" };
  }
}

export async function requestGuestChange(formData) {
  const token = String(formData.get("token") ?? "");
  const locale = ...;
  const message = ...;
  if (message.length > MAX_GUEST_MESSAGE_LENGTH) return;
  try {
    const invitation = await loadGuestInvitation({ token }, locale);
    if (!invitation) return;
    const result = await requestGuestChangeCore(invitation, message, locale);
    if (!result) return;
    redirect(`/${locale}/runs/${result.runId}/status?returnTo=${encodeURIComponent(
      `/${locale}/g/${token}`,
    )}&token=${encodeURIComponent(token)}`);
  } catch (error) {
    if (isRedirect(error)) throw error;
    throw reportedActionError("guest_change_failed", error);
  }
}

export async function reconfirmGuest(formData) {
  const token = ...; const locale = ...;
  try {
    const invitation = await loadGuestInvitation({ token }, locale);
    if (!invitation) return;
    const applied = await reconfirmGuestCore(invitation);
    if (!applied) return;
    redirect(`/${locale}/g/${token}`);
  } catch (error) {
    if (isRedirect(error)) throw error;
    throw reportedActionError("guest_reconfirm_failed", error);
  }
}
```

Update the `vi.mock("./guest-data", ...)` in `actions.test.ts` to
`vi.mock("@/core/booking/guest-invitation", ...)` and add mocks for the new
`@/core/booking/guest-actions` module as needed by the two new tests from
Step 1.

## Step 6 — Make shared guest components accept injected actions + optional token

`guest-invite-form.tsx`:
- Add `findAction`/`submitAction` props typed as the same function shapes
  currently imported directly (`typeof findGuestOptions`, `typeof
  submitGuestVisit`); remove the hardcoded import from
  `@/app/[locale]/g/[token]/actions`; use the props in the two
  `useActionState` calls (lines 45-52).
- `token` prop becomes `token?: string`. At lines 106 and 297, render the
  hidden input conditionally: `{token ? <input name="token" type="hidden" value={token} /> : null}`.
- `GuestRoomReviewProps.token` becomes optional too (it's threaded through
  from `GuestInviteForm`).

`guest-actions.tsx`:
- Add `reconfirmAction`/`requestChangeAction` props (typed as `typeof
  reconfirmGuest`, `typeof requestGuestChange`); remove the hardcoded import.
- `token` prop becomes `token?: string`; hidden inputs at lines 28 and 39
  become conditional, same pattern as above.

`g/[token]/page.tsx`:
- Import `findGuestOptions`, `submitGuestVisit`, `reconfirmGuest`,
  `requestGuestChange` from `./actions` (unchanged path) and pass them
  explicitly as props to `<GuestInviteForm>` / `<GuestActions>`.

## Automated success criteria

- `actions.test.ts` (updated) passes, including the two new characterization
  tests from Step 1, with the refactored implementation.
- `pnpm run typecheck ; pnpm run lint ; pnpm run test` all pass.
- No behavior change on `/[locale]/g/[token]` — confirmed by the unchanged
  assertions in the existing two tests plus the new two.

## Manual success criteria

- Manually exercise a real magic link (`/es/g/<seed token>`) locally: search
  for a stay, submit, reconfirm, request a change — all identical to
  pre-refactor behavior. (Full manual walkthrough happens in phase 5 once the
  guest route also exists; a quick smoke check here is enough to catch a
  broken refactor early.)
