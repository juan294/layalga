# Proactive follow-through with a controllable clock

Status: Draft. Publication needs separate authorization.

## A booking is not the end of coordination

Many agent demos stop when a record is created. Household coordination has a later failure mode: the visit was confirmed months ago, arrival is close, and nobody knows whether the plan still holds.

L’Ayalga follows up three days before arrival. If a guest does not reconfirm within 24 hours, it alerts both hosts. That behavior needs durable jobs, safe retries, and a way to demonstrate time without pretending that a five-minute video lasted four days.

We built one reconfirmation state machine and gave it two clocks: system time for normal operation and a clearly labeled database-backed clock for the synthetic demo.

## Postgres is the schedule authority

An external scheduler is a trigger, not the source of truth. Each confirmed visit creates a `scheduled_jobs` row with a kind, due time, status, attempt count, and lease fields. The database row answers the important questions:

- What should happen?
- When is it due?
- Has a worker claimed it?
- Did it finish, fail, or get cancelled?
- Which visit and reconfirmation cycle does it belong to?

Vercel Cron calls `/api/ticks` every minute. The route claims due rows and enqueues the same tick task used by tests and the demo clock. It also recovers expired agent-run leases and drains queued runs. Production dispatch now sends every one of those runs, ticks included, to a live Amazon Bedrock AgentCore Runtime rather than executing in the Vercel process; the caller still owns the claim, so a bare tick is awaited straight through to completion instead of claimed twice. The repository also contains an EventBridge Scheduler adapter, not yet the selected trigger, for a future retry path.

## Claim before delivery

Two workers can wake at the same time. A claim transaction selects due work with row locking, marks it running, and sets a lease. A partial unique index prevents two open jobs of the same kind for one visit.

The lease makes a crashed worker recoverable. After expiry, another tick can claim the job. Scheduled jobs wait one minute after a first failure and five minutes after a second failure. A third failure quarantines the job for operator review. That means delivery must also be idempotent.

Notifications use the scheduled job ID as part of their idempotency boundary. A party chase can be inserted once for that job. A host escalation can be inserted once per host for that job. A retry after notifying the first host can safely continue to the second without duplicating the first notification.

Scoping to the job matters. The same visit can enter a later reconfirmation cycle after a reschedule. A visit-wide uniqueness key would suppress a legitimate future chase.

## Two steps, not one timer

The state machine has two job kinds:

1. `reconfirm_chase` becomes due at T-3.
2. If the visit remains unanswered, `reconfirm_escalate` becomes due 24 hours after the chase.

The chase sends one party notification. With two demo visits, that is two party notifications. If one party does not respond, the escalation sends one notification to each of the two hosts. The final demo assertion is therefore four notifications in total, with exactly two host escalations.

If the guest reconfirms, open jobs for that visit are cancelled. If the stay is rescheduled, the old jobs are cancelled and a new chase is created from the new arrival date.

## The clock is a dependency

Calling `new Date()` throughout the code would make the proactive flow slow and fragile to test. Core functions receive a small `Clock` interface:

```ts
interface Clock {
  now(): Date;
}
```

`SystemClock` returns real time. `DbDemoClock` reads the current timestamp stored for the demo home. The booking and job code do not know which implementation is active.

The demo UI can move that stored time to prepared points:

- T-3, which makes both chase jobs due.
- T-3 plus 24 hours, which makes one escalation due after the scripted non-response.

The banner and control say that the clock is synthetic. The demo is accelerated, but the state transitions, claims, agent tools, notification writes, and audit records are the same code used by the normal path.

## Reset is part of the feature

A controllable clock is useful only if the whole scenario is repeatable. `POST /api/demo/reset` restores fixed synthetic hosts, rooms, parties, and invitations. It removes demo visits, runs, sessions, decisions, jobs, notifications, and audits. Calling reset twice returns byte-identical results.

The end-to-end driver then performs the four product beats through public HTTP surfaces and checks the authoritative final database state. The release probe wraps that run with a random marker and cleans only tagged artifacts in `finally`, including after a failed assertion.

This cleanup contract is not only test hygiene. It proves that proactive automation can identify the data it owns.

## Test time as product evidence

The controllable clock helped us find problems that a simple happy path would miss:

- Scheduling succeeded in the database but was not synchronized to the external adapter.
- A retry after partial host delivery could duplicate the first notification.
- A later reconfirmation cycle could be blocked by an idempotency key from an earlier cycle.
- Concurrent code could create duplicate open jobs before either external scheduling call returned.

Each issue became a focused test around the same state machine.

Proactive agents need evidence after the first response. A durable job ledger shows what they promised to do. Idempotency shows what they already did. A controllable clock lets us test both claims now, without changing the meaning of time in production.
