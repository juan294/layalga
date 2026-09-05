# Agents for Humans: testing proactive follow-through with an honest clock

Unpublished Builder post draft, updated 5 September 2026 against product commit `618701c`. Publication and URL are pending owner action. Local workflow evidence and earlier production runtime evidence are distinct.

## Booking is not the end of coordination

A confirmed visit can still leave a household uncertain. Are the guests coming? Did someone answer? Has a reminder failed, or has the guest simply not replied?

L’Ayalga schedules a reconfirmation chase for 09:00 household time three days before arrival, or immediately if confirmation happens inside that window. An unanswered request can escalate after 24 hours. A guest answer cancels the escalation for the current cycle. Cancellation and rescheduling retire follow-up that no longer belongs to the visit's current state.

The agent helps phrase the message. The [job engine](../../../src/core/reconfirmation/jobs.ts) owns due work, claims, leases, bounded retries and required-recipient fallback. A model omitting a notification tool call cannot silently remove the required in-app outcome.

## A demo shortcut should operate on real jobs

A fixed “jump three days” button is fragile. The relevant visit may have changed, a job may be waiting for a retry, or a worker may still hold a live lease.

Our [semantic clock service](../../../src/core/demo/advance-clock.ts) selects an eligible persisted chase or escalation and advances to its effective due/retry time. It preserves current-cycle, pre-arrival and lease constraints. A currently leased job is not made claimable by artificially aging the lease. An exhausted shortcut says no eligible work remains. Custom time moves forward only.

`DbDemoClock` substitutes time only for an enabled synthetic household. Guest defaults, room search and policy use that same household clock, so an expired demo hold does not remain falsely occupied in search. Real invitation and email capability authentication continue to use real expiry; the demonstration clock cannot extend guest authority.

## Show both an answer and silence

The guided demo starts with Vega: four guests book both open rooms without a host decision. Run a chase, answer reconfirmation, and inspect the reconfirmed host outcome.

Then start Otero. This visibly resets shared synthetic state and begins a fresh two-person Garage Room request containing an explicit request. Approve it, run its chase, leave it unanswered, and escalate. The host sees unresolved follow-up. Repeating an exhausted shortcut produces feedback rather than a duplicate alert.

The scenarios are independent; we do not imply the reset visits coexist. Reset preserves stable synthetic identities and renews finite invitation expiry. That is reproducible setup, not byte-identical database state at every real-world date.

## Delivery trouble is not guest silence

Real guests can explicitly consent to reminders, verify their address, return to the authorized visit and opt out. GET verification displays review; POST deliberately verifies. Return capabilities are revalidated on each request. Guest contacts and delivery receipts are web-only, outside the agent's database authority and model prompt.

The delivery service rechecks consent, current visit/source cycle and cancellation before submission. It records an authorized attempt before calling SES. Known failure and an unknown provider outcome are distinct; the latter cannot safely be treated as a failed send and blindly retried. SES acceptance does not prove inbox receipt.

Synthetic guest invitations never send guest email. The local evidence configuration uses `EMAIL=none`, and the UI reports unavailable delivery honestly. The pending [production readiness work](../../release/guest-email-readiness.md) is separate from demonstrating the scheduling state machine.

## What we measure

The [coordination evidence](../coordination-evidence.md) records actual automated interactions, persisted outcomes, automation wall time and simulated time separately, tied to an exact source revision and local configuration. Navigation, setup, demo clock moves and simulated user decisions are distinct categories.

The [clock integration tests](../../../src/core/demo/advance-clock.integration.test.ts), [guest search clock tests](../../../src/core/booking/guest-clock.integration.test.ts) and [guided browser regression](../../../tests/e2e/guided-demo.spec.ts) cover the application behavior. These are not human time savings, live-model quality measurements or email receipt evidence. A separate [participant protocol](../participant-protocol.md) defines how to investigate human impact.

The clock is useful because it makes real persisted follow-through inspectable without pretending that a staged demonstration waited several days.
