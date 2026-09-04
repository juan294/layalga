# Phase 3 — Cookie-authorized guest route

Depends on phase 1 (`getCurrentGuestInvitation`, guest cookie) and phase 2
(`core/booking/guest-invitation.ts`, `core/booking/guest-actions.ts`, the
optional-token/injected-action components).

## Files

- `src/app/[locale]/guest/page.tsx` (new)
- `src/app/[locale]/guest/actions.ts` (new)
- `src/app/[locale]/demo-enter-guest/route.ts` (new)
- `src/app/[locale]/demo-enter-guest/route.test.ts` (new)
- `src/app/api/runs/run-data.ts` (edit)
- `src/app/api/runs/run-data.test.ts` (edit, if it exists — check first; add
  a test for the new guest-cookie branch either way)

## Step 1 — `demo-enter-guest` route (red then green)

Mirror `(host)/demo-enter/route.ts` exactly, substituting host concepts for
invitation concepts. Write the test first (no existing precedent test file
for either demo-enter route was found; establish the pattern here using
`NextRequest`/`FormData` construction consistent with other route tests in
the repo):

Cases:
- 404 when `DEMO_MODE !== "true"`.
- 404 when the locale is invalid.
- 400 when `invitationId` is missing/not a string.
- 404 when the invitation exists but its home is not `demo = true`.
- 303 to `/${locale}/guest` with the `layalga_demo_guest` cookie set
  (httpOnly, sameSite lax, secure in production, path `/`, `DEMO_GUEST_MAX_AGE`)
  when the invitation belongs to a demo home.

```
// src/app/[locale]/demo-enter-guest/route.ts
export async function POST(request: NextRequest, { params }: Context) {
  const { locale } = await params;
  if (process.env.DEMO_MODE !== "true" || !hasLocale(routing.locales, locale)) {
    return new NextResponse(null, { status: 404 });
  }

  const form = await request.formData();
  const invitationId = form.get("invitationId");
  if (typeof invitationId !== "string") {
    return new NextResponse(null, { status: 400 });
  }

  const sql = getDatabaseConnection().sql;
  const [invitation] = await sql<{ id: string }[]>`
    select invitation.id
    from public.invitations as invitation
    join public.homes as home on home.id = invitation.home_id
    where invitation.id = ${invitationId} and home.demo = true
  `;
  if (!invitation) return new NextResponse(null, { status: 404 });

  const response = new NextResponse(null, {
    status: 303,
    headers: { location: `/${locale}/guest` },
  });
  response.cookies.set(DEMO_GUEST_COOKIE, createDemoGuestCookie(invitation.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DEMO_GUEST_MAX_AGE,
  });
  return response;
}
```

## Step 2 — `run-data.ts` third authorization branch

Add the guest-cookie fallback after the existing host-cookie fallback in
`getAuthorizedRunSnapshot` (`src/app/api/runs/run-data.ts:40-58`):

```
let authorized = false;
if (token) {
  const invitation = await findInvitationByToken(getDatabaseConnection().db, token);
  authorized = !!invitation && invitation.homeId === run.home_id
    && run.session_id === `inv_${invitation.id}`;
}

if (!authorized) {
  const host = await getCurrentHost();
  authorized = host?.homeId === run.home_id;
}

if (!authorized) {
  const guest = await getCurrentGuestInvitation();
  authorized = !!guest && guest.homeId === run.home_id
    && run.session_id === `inv_${guest.invitationId}`;
}
if (!authorized) return null;
```

Add a unit test: a run with `session_id = "inv_<id>"` and no token in the
request is authorized when `getCurrentGuestInvitation()` resolves to that
same `invitationId`/`homeId`, and rejected when it resolves to a different
invitation or home. Follow the existing mocking pattern in this file's test
suite (mock `getCurrentHost` already exists as precedent if this file has
tests; if not, add a new `run-data.test.ts` covering all three branches for
completeness, not just the new one).

## Step 3 — The guest route itself

`src/app/[locale]/guest/page.tsx` — structurally identical to
`g/[token]/page.tsx`, but resolves identity from the cookie instead of a URL
segment, and redirects (rather than rendering an "invalid link" card) when
there's no session — a demo route with no cookie is a signed-out state, not
a broken link:

```
export default async function GuestSessionPage({ params }: { params: Promise<{ locale: "en" | "es" }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await getCurrentGuestInvitation();
  if (!session) redirect(`/${locale}/sign-in`);

  const t = await getTranslations({ locale, namespace: "Guest" });
  const invitation = await loadGuestInvitation({ invitationId: session.invitationId }, locale);
  if (!invitation) redirect(`/${locale}/sign-in`); // cookie stale/invalidated

  // ...from here, identical rendering to GuestPage in g/[token]/page.tsx,
  // but:
  //  - no `token` prop passed to GuestInviteForm/GuestVisitRecord/GuestActions
  //  - findAction/submitAction/reconfirmAction/requestChangeAction props
  //    come from ./actions (this route's own action module) instead of
  //    ../[token]/actions
  //  - the Google-claim aside can be omitted entirely: a demo-cookie guest
  //    has no real invitation to "claim" — drop the <aside className={styles.claim}> block
}
```

Reuse the `GuestVisitRecord` local component by importing it from
`g/[token]/page.tsx` if it's exported, or duplicate the ~30-line function
locally if not currently exported — prefer exporting it from the token page
and importing it here over duplicating, since it has no token-specific
logic itself (it receives `token` as a prop already, which becomes optional
per phase 2).

`src/app/[locale]/guest/actions.ts` — thin wrappers parallel to
`g/[token]/actions.ts`, but resolving authority from the cookie and building
`/guest`-flavored redirects with no `token` query param:

```
export async function findGuestOptionsSession(_previous, formData) {
  const session = await getCurrentGuestInvitation();
  if (!session) return { status: "error", options: [], error: "not_found" };
  const parsed = sessionOptionInput.safeParse(...); // same as optionInput minus `token`
  if (!parsed.success || ...) return { status: "error", options: [], error: "invalid" };
  return findGuestOptionsForAuthority(
    { id: session.invitationId, homeId: session.homeId, partyId: session.partyId },
    parsed.data,
  );
}

export async function submitGuestVisitSession(_previous, formData) {
  const session = await getCurrentGuestInvitation();
  if (!session) return { status: "error", error: "not_found" };
  const parsed = sessionSubmitInput.safeParse(...); // same as submitInput minus `token`
  if (!parsed.success) return { status: "error", error: "invalid" };
  try {
    const { runId } = await submitGuestVisitForAuthority(
      { id: session.invitationId, homeId: session.homeId, partyId: session.partyId },
      parsed.data,
    );
    redirect(`/${parsed.data.locale}/runs/${runId}/status?returnTo=${encodeURIComponent(
      `/${parsed.data.locale}/guest`,
    )}`); // no &token= — run-data.ts falls back to the guest cookie
  } catch (error) {
    if (isRedirect(error)) throw error;
    reportActionError("guest_submit_failed", error);
    return { status: "error", error: "failed" };
  }
}

export async function requestGuestChangeSession(formData) {
  const session = await getCurrentGuestInvitation();
  if (!session) return;
  const locale = formData.get("locale") === "es" ? "es" : "en";
  const message = String(formData.get("message") ?? "").trim();
  if (message.length > MAX_GUEST_MESSAGE_LENGTH || !message) return;
  try {
    const invitation = await loadGuestInvitation({ invitationId: session.invitationId }, locale);
    if (!invitation) return;
    const result = await requestGuestChangeCore(invitation, message, locale);
    if (!result) return;
    redirect(`/${locale}/runs/${result.runId}/status?returnTo=${encodeURIComponent(`/${locale}/guest`)}`);
  } catch (error) {
    if (isRedirect(error)) throw error;
    throw reportedActionError("guest_change_failed", error);
  }
}

export async function reconfirmGuestSession(formData) {
  const session = await getCurrentGuestInvitation();
  if (!session) return;
  const locale = formData.get("locale") === "es" ? "es" : "en";
  try {
    const invitation = await loadGuestInvitation({ invitationId: session.invitationId }, locale);
    if (!invitation) return;
    const applied = await reconfirmGuestCore(invitation);
    if (!applied) return;
    redirect(`/${locale}/guest`);
  } catch (error) {
    if (isRedirect(error)) throw error;
    throw reportedActionError("guest_reconfirm_failed", error);
  }
}
```

Add a `guest/actions.test.ts` mirroring `g/[token]/actions.test.ts`'s
structure, mocking `getCurrentGuestInvitation` instead of a token, covering
the same four functions' happy paths plus the "no session" early-return.

## Automated success criteria

- New tests for `demo-enter-guest/route.ts`, `guest/actions.ts`, and the
  `run-data.ts` guest-cookie branch all pass.
- `pnpm run typecheck ; pnpm run lint ; pnpm run test` all pass.

## Manual success criteria

- With a demo-guest cookie set manually (e.g. via browser devtools or a
  script calling `createDemoGuestCookie`), visiting `/en/guest` renders The
  Oteros' invited state; without the cookie, visiting `/en/guest` redirects
  to sign-in. (Full click-through happens once phase 4 wires the sign-in
  button; this step is a direct-navigation smoke check.)
