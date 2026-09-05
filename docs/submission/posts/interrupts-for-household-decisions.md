# Agents for Humans: durable interrupts for household decisions

Unpublished Builder post draft, updated 5 September 2026 against product commit `618701c`. Publication and URL remain pending owner action. Current completion features have local verification; this article does not claim their production rollout.

## A person may answer after the process ends

A household coordinator cannot keep a web request open while two hosts consider a guest's request. It also cannot treat any later “yes” as permission to book whatever rooms happen to be mentioned in a model transcript.

L’Ayalga uses the Strands SDK's interruption and resumption to preserve the pending operation, with application records that define what a host actually approved.

## Three records, three jobs

The SDK session snapshot preserves the paused execution. A pending-decision row presents the party, stay, request and proposed arrangement to the host. A resume run applies the saved response and records the result.

[`installPolicyHook`](../../../src/agent/policy-hook.ts) calls `event.interrupt` before a guarded booking operation when an explicit request or overflow arrangement needs a host. The host action records approval or decline. [`run-task.ts`](../../../src/agent/run-task.ts) reconstructs trusted state and supplies `InterruptResponseContent` to resume the SDK execution.

An interrupted request does not necessarily hold rooms: the pause may happen before hold creation. The UI must describe the actual stage instead of implying that every waiting request already has a reservation.

## Approval is specific and can become stale

The trusted guest draft preserves captured requests and the exact proposed stay. Informational notes are separate and do not themselves interrupt. A later model call cannot clear a request to make approval unnecessary.

On resume, current room selection, availability and versioned household policy are rechecked. Applied-run tracking and current queue claims prevent duplicate or stale workers from applying the same decision again. A failed application is shown as failed and can receive an authorized retry; a saved approval alone is not a confirmed stay.

This is a useful split: the SDK owns durable execution state, while the application owns the meaning and authority of the human decision.

## Cancellation must close pending authority

The decision lifecycle includes cancellation as well as pending, approved and declined states. If a guest cancels while an agent is working, it is not enough to hide the calendar event. A worker must not subsequently persist a new decision or apply an old approval.

The [cancellation service](../../../src/core/booking/cancellation.ts) serializes against current booking work and retires stale decisions, runs, follow-up jobs and queued delivery. Interruption persistence rechecks the invitation and run under the same household boundary. A cancelled decision cannot be resumed as if it were still pending.

The agent's `prepare_cancellation` tool can interpret a cancellation request and return a review instruction. It cannot execute the cancellation. The guest or host must review and explicitly confirm the current stay; a changed stay requires refreshed review. Unbooked invitations have an equivalent withdrawal path.

## Durable does not mean transport exactly once

Host pings make decisions visible outside the dashboard when email is enabled. Optional guest verification/reminders use a separate consented, web-owned delivery path; they are not agent tools or agent-readable contact data.

Database idempotency prevents duplicate application records and unauthorized replay. It does not prove that an external provider or inbox delivers exactly once. Authorized attempt receipts distinguish known failure from an uncertain provider result, and uncertain sends are not blindly retried. Delivery problems remain separate from unanswered guest requests.

## Evidence

See [policy refresh tests](../../../src/agent/policy-hook-refresh.test.ts), [cancellation race regressions](../../../src/core/booking/cancellation.integration.test.ts), [tenant authority tests](../../../src/agent/tenant-scope.test.ts) and the [guided browser journey](../../../tests/e2e/guided-demo.spec.ts). The [evidence report](../coordination-evidence.md) records actual local scripted operations with its own exact revision and configuration.

The demonstration is a fresh routine stay, then a separate explicit request and approval. It proves persisted application transitions under that configuration. Human savings, live-model interpretation quality and production email receipt remain separate questions.
