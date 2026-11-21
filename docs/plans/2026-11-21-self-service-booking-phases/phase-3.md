# Phase 3 · One host decision completes the booking

**Outcome.** Either authorized host can review the guest’s exact proposal, check their own plans and confirm or decline once. A successful approval finishes the booking and makes its outcome available to the guest automatically.

## Implementation

1. Add a final-review card to the household dashboard near `src/app/[locale]/(host)/page.tsx:265`. Show requester identity as authorized, dates, rooms, party, notes, special requests, and any explicitly accepted overflow arrangement. Say what the decision means: the host will be home and agrees to this particular stay. Recheck room availability automatically. Keep ordinary booking-exception decisions distinct from these complete-stay reviews.
2. Apply a host decision in the web domain. Derive host and home from the authenticated session. Serialize with the existing home booking lock and lock the versioned request in a consistent order for all mutations. Verify that it is pending, the arrival has not passed and the exact reviewed terms still hold. An identical retry returns the recorded outcome. A different decision on an already answered request reports who acted and the current state to the host. A concurrent withdrawal can win before approval.
3. For approval, bind the verified requester to the accepted stay. Create a fresh party or reuse a uniquely authorized same-home party for that verified identity. Where ambiguous, use a fresh party. Never merge by surname or contact text. Create an internal invitation for compatibility with the visit lifecycle. The guest acquires access through the verified request. The host does not issue or deliver a link manually.
4. Extract transaction-taking internals from `src/core/booking/invitations.ts:172`, `src/core/booking/holds.ts:137` and `src/core/booking/holds.ts:254`. Preserve their existing entry points. Within the single transaction, check rules, exact selection, overflow wording/consent and host authority, perform the hold-to-confirm transition, link the visit to the request and write the guest-visible outcome and audit. The internal hold cannot become visible as a pending reservation. Existing confirmation updates calendar eligibility, extends invitation access and schedules the durable reconfirmation job at `src/core/booking/holds.ts:309`. Keep external scheduling after commit. For a changed material term, roll back booking work, then conditionally mark only the same pending version as needing a new selection. If another action won that race, return its recorded outcome. A transient database error leaves the request retryable.
5. Decline records a guest-visible outcome even if room availability has changed. Never expose a private reason such as the hosts’ whereabouts. An authenticated guest can withdraw a pending request. Once confirmed, show the canonical visit, its change/cancellation controls and the normal stay-aligned reconfirmation cycle. Confirming in this phase supplies no general permission for later changes. See `src/components/guest/guest-visit-record.tsx:1`, `src/core/booking/cancellation.ts:1` and `src/core/reconfirmation/jobs.ts:95`.

```text
@ decideRequestedStay(hostSession, requestRef, reviewedVersion, answer) -> outcome
ctx: authoritative booking database and household clock
do:
  1. validate host membership and lock home and request
  2. lookup exact selection, consent, version and any prior outcome
  3. write a fresh decline immediately or compute feasibility for approval
  4. write confirmed visit and related records for a successful approval
  5. emit committed outcome and synchronize external scheduling after commit
fail: stale selection -> return fresh search to guest without a reservation
```

## Acceptance

**Automated.** From the Phase 2 pending state, a single host approval results in exactly one confirmed visit for the submitted dates and room set, one request-to-visit relationship, correct occupancy rows, calendar eligibility and one active chase job. The guest sees the result without rebooking. Exercise normal fit, accepted overflow and a special request together. Deny overcapacity, changed arrangements, newly conflicting policy, withdrawn consent, foreign household and stale review. Race two hosts, withdrawal against approval, two overlapping requests and a private block against approval. Inject failures after invitation and occupancy writes and assert full rollback. Simulate loss of the response after commit and assert replay returns the same visit. Scheduler/delivery failure cannot undo a booking or create another one. Existing invitation-first and calendar tests remain green. Reference oracles include `src/core/booking/holds.concurrency.test.ts:181`, `src/core/booking/holds.concurrency.test.ts:515` and `scripts/release-probes.ts:505`.

**Manual.** With two fixture accounts, read the decision card and guest receipt in English and Spanish. The host can tell whether the room check succeeded and what they personally approve. The guest can distinguish pending, confirmed, declined and “choose another stay.”

**Coordination.** Keep booking, request-state and scheduling changes under one integration owner. End-to-end checks follow the committed transaction contract.
