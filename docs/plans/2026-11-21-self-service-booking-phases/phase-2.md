# Phase 2 · Submit an exact stay and track the reply

**Outcome.** An interested guest can submit a complete stay themselves and return to its private status. The hosts receive one actionable request. They do no work during discovery, identity verification, room selection or submission.

## Implementation

1. Allow browsing before authentication. For submission and return, the proposed default is Google sign-in with a requester-only account page. Allow a new verified user into the request flow and their own history without a host mapping or a prior party claim. Preserve the chosen exact stay across the OAuth round trip, bound to the initiating browser with a short expiry. Revalidate dates, listing, selection and terms on return, and confirm the same guest intent once. Limit the new callback branch to the request paths. Keep unrelated callback and invitation claims on their existing routes (`src/app/auth/callback/route.ts:28`, `src/lib/auth/party-claim.ts:6`, `src/lib/auth/safe-next-path.ts:1`).
2. Add a web-role-owned request record keyed by household, verified requester and idempotency key. Retain the exact stay, party, selected room references, material room/overflow terms reviewed by the guest, consent, immutable host-decision requests, informational notes, locale, version, timestamps and lifecycle state. Store a canonical payload fingerprint. Keep requester identity out of public search, model inputs, cache keys shared across users and tool results for other guests. Add composite household constraints, grants, RLS and indexes for pending host and private requester lookups. Grant no direct anonymous table access. Exercise grants and row isolation independently.
3. On a retry, resolve the original idempotency key before testing limits or availability again. For a new submission, recompute feasibility and bind only the exact guest-selected rooms. A submitted request makes no occupancy or calendar entry. Replay of an identical submission returns its original receipt. The same key with different content returns a conflict with recovery to the existing request or a new explicit submission. A bounded server-side per-requester limit on distinct pending requests to one home prevents a guest flooding the host queue. Use a configurable initial ceiling of three, allow withdrawal and show the existing requests when reached. Expire unresolved proposals when local check-in is past, including on reads/apply if background processing is late.
4. Give the verified guest a status view with exact terms, refresh and withdrawal while pending. After approval, the receipt links automatically to the booked stay. A rejection or loss of availability offers another search. Use the same status service from the guest conversation. Requesting a booking confers no permission to read prior party history.
5. Feed actionable requests into the host dashboard and add a pending-stay-request kind to the existing host ping pathway, with matching database constraint, candidate lookup, template and link to the review card. Use existing host notification settings, uniqueness and stale-candidate recheck. A committed pending request is visible to hosts even if email is disabled or delivery fails. Show the guest a receipt on commit. The selected account/status path supplies their answer independently of guest reminder enrollment. Extend retention for request text and identity with explicit expiry: remove lapsed unbooked request detail after 30 days from terminal state; retain only minimal linkage to a confirmed visit as long as that visit needs it. Reflect actual retention in the notice.

```text
@ submitStay(requesterSession, selection, key) -> privateReceipt
ctx: published household, booking rules and request store
do:
  1. validate requester, payload and explicit guest intent
  2. lookup idempotent result under requester and household
  3. validate limits and compute current terms for a new request
  4. write one pending request and return its private receipt
fail: expired selection or new terms -> show current choices for guest review
```

## Acceptance

**Automated.** Starting with an unclaimed guest and no invitation, search first, sign in at send time, submit and return after logout/login. Assert one request, one host card and zero invitations, holds, occupancy, calendar events or confirmed visits. Test network replay across response loss, key mismatch, concurrent cap/withdrawal, expiry even with a delayed tick, email disabled/failure, requester isolation and host household isolation. Another Google account with the same surname cannot read the receipt. Closing the sign-in dialog leaves the selection recoverable. Keep host and token-based guest callback suites green, including the existing unrelated-account rejection.

**Manual.** In English and Spanish a first-time guest can see who will review the request and where to find the outcome. The host can navigate from the notification to the correct pending request. Record synthetic provider acceptance separately from actual inbox delivery.

**Coordination.** One owner integrates the data, status and notification contract before the Phase 3 decision work. Keep request submission private to local fixtures until the host response flow exists.
