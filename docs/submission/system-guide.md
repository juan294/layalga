# L’Ayalga system guide

Current product reference: commit `618701c`, 5 September 2026. Completion phases 1–5 are implemented and locally verified. Production rollout, new guest-email permissions and real-email verification remain separate pending operations. Package metadata is not evidence of a release tag or deployment.

For a first review, use the [canonical judge guide](judge-guide.md). For everyday use, see the [host](../guides/host-manual.md) and [guest](../guides/guest-manual.md) manuals. This document explains how the parts fit together without duplicating every operator command.

## 1. The product and its intended audience

L’Ayalga coordinates friends-and-family visits to a household with multiple hosts. The host captures an invitation, the guest chooses feasible rooms, routine bookings proceed, and explicit requests or overflow arrangements pause for a person. The coordinator continues through reconfirmation, unanswered follow-up, changes and cancellation.

The intended benefit is less repeated coordination and clearer responsibility. Human time savings and adoption have not yet been measured. The [synthetic evidence report](coordination-evidence.md) records automated workflow outcomes; the [participant protocol](participant-protocol.md) defines a separate human baseline.

## 2. Hackathon and submission status

The [official rules](https://agentsforhumans.devpost.com/rules), checked 5 September 2026, give five equally weighted criteria: technical implementation, design, potential impact, creativity/originality and presentation. The judge guide maps each to source, tests and evidence limits.

The deadline is 14 September 2026 at 17:00 PDT, judging continues through 8 October, and the video maximum is five minutes. Our video draft targets about three minutes. Recording is planned as an owner task for 13 September; upload URL and final submission are pending.

An AWS Builder ID is a required entry item to verify before submission. Eligible public Builder posts can earn 0.2 bonus points each, up to 0.6. The three local drafts are unpublished and use “Agents for Humans” in their titles. No bonus, publication or entry completion is claimed until it actually occurs.

## 3. Architecture and authority

The [architecture sources and diagrams](../architecture/README.md) are the visual reference.

| Layer | Responsibility | Boundary |
| --- | --- | --- |
| Next.js web application | Identity, forms, queued work, decisions, guest capabilities, calendar reads and email delivery | Derives authority server-side; posted identifiers alone grant nothing. |
| Strands agent | Language interpretation, typed tool choice, bounded preparation and bilingual explanations | Cannot invent approval, overwrite trusted guest consent or directly confirm cancellation. |
| Deterministic services | Availability, selection, policy, memory ranking, booking transactions, retries and scheduling | Recheck current state before committing consequential work. |
| PostgreSQL | Authoritative rooms, occupancy, visits, invitations, decisions, jobs, runs and delivery receipts | Constraints and household serialization preserve consistency under races. |
| People | Requests, room choice, explicit consent, exception decisions, cancellation confirmation | Remain responsible for judgments the workflow asks them to make. |

Web and agent execution use non-owner database identities with distinct granted roles. The agent cannot read private room notes or web-only guest contacts, outbox and attempt receipts. Administrative connections are reserved for migrations/operations. See the [database/runtime runbook](../release/runtime-database-and-identity.md) for exact provisioned role names and deployment details.

## 4. AWS services and deployment evidence

**Amazon Bedrock** supplies the model in the live-model configuration. The current example configuration uses Claude Sonnet 4.6. Local verification can use a scripted model; this proves workflow behavior and deterministic boundaries, not language-model quality.

**AgentCore Runtime** executes the deployed agent architecture. The web app invokes queued work, and execution results report the runtime used. A [historical trace screenshot](assets/agentcore-trace.png) demonstrates the earlier September 2026 production path. It is not a fresh trace of these completion changes.

**AgentCore Memory** supports optional party-scoped recall and bounded room preference reads. It is not authoritative for booking facts. **CloudWatch and OpenTelemetry** expose runtime, model and tool execution. Identifier-only custom attributes do not guarantee raw text elsewhere in a trace contains no personal information.

**SES** supports web-owned host pings and implemented consented guest verification/reminder delivery. Production guest activation still requires the prepared permissions and operational checks in [guest email readiness](../release/guest-email-readiness.md). Do not infer permission deployment or inbox delivery from local tests.

**EventBridge Scheduler** has an adapter, but the documented selected scheduling path uses the PostgreSQL job table and Vercel Cron. Demo homes use the no-op external scheduler. Infrastructure provisioning and production configuration live in the operator runbooks, not this walkthrough.

## 5. Strands integration

[`buildAgent`](../../src/agent/agent.ts) wires the SDK Agent, task-specific typed tools, sequential execution, locale system prompts, PostgreSQL SessionManager storage, policy hook and optional MemoryManager. The [Strands guide](strands-usage.md) contains the authoritative tool inventory and source map.

The policy hook gates hold creation, confirmation and rescheduling. It checks trusted room selection and deterministic overlap rules, audits the verdict, denies impossible requests and interrupts for explicit requests or overflow. The SDK saves the interrupted execution; the application persists the host decision separately.

A resume reconstructs trusted input and rechecks current policy and availability. Applied-run and claim checks prevent stale workers from applying a decision again. Cancellation serializes against interruption/resume and retires obsolete authority. Natural-language cancellation only prepares the review; web confirmation commits it.

## 6. Queue, jobs and clocks

User requests enqueue work and return a run identifier for progress. Idempotency keys, bounded attempts, expiring claims and heartbeats support recovery. Terminal writes require the current claim. A technical failure is visible and does not imply a completed booking.

Confirmation schedules a reconfirmation chase for 09:00 household time three days before arrival, or immediately inside that window. A chase opens a current request and schedules escalation after 24 hours. A guest answer cancels the escalation. Rescheduling and cancellation retire work belonging to the old state or cycle. The job engine supplies required-recipient notification fallback when the model omits it; durable delivery does not depend solely on prompt compliance.

Jobs use leases and bounded retries; exhausted jobs can be quarantined. Follow the [runtime runbook](../release/runtime-database-and-identity.md) for recovery instead of replaying arbitrary jobs.

`DbDemoClock` only substitutes stored time for enabled synthetic households. Guest search/defaults and demo policy use that household clock. Real invitation and contact capability expiry still use real time. Semantic chase/escalation controls choose an eligible persisted job and its effective retry time, preserve current-cycle/pre-arrival/lease guards, and report no work when exhausted. Custom time can move forward only.

## 7. Rooms and household policy

Rooms expose guest labels, sleeping arrangements, capacities and availability. Private notes remain private. Draft, inactive or incomplete rooms cannot be offered. A withheld room needs an opening covering the complete stay; closed or privately occupied dates are excluded.

Guest stays and private blocks share occupancy enforcement. Search ignores cancelled visits and expired holds while retaining private blocks and live holds. The final write rechecks availability under household serialization, so two racing searches do not both win the same room.

Children-family limits and overlapping-pet rules are host-configurable, versioned settings. Default demo values are one family with children and no overlapping parties with pets. Capacity remains a hard boundary. Maximum-only capacity requires a documented overflow arrangement, explicit guest consent and host approval. Approval never overrides occupancy or household rules.

Agent room requests prepare exact proposals for a private block, opening or closure. A host must explicitly apply them. Calendar subscriptions are read-only and revocable; generic event summaries, stable IDs and cancellation tombstones avoid leaking family names or preserving cancelled stays as active events.

## 8. Host journey

The host view prioritizes pending decisions, capture and current visit outcomes with delivery status. Synthetic guidance and clock controls follow; room administration, calendar tools, settings, memory and records remain available.

Capture progress is embedded and follows the exact run. Successful completion automatically invokes authorized private-link preparation once; only a failure offers a retry. The host still deliberately copies and sends the link. The agent tool returns identifiers, not the capability.

Informational notes are available in authorized visit detail without creating decisions. Explicit requests remain visible in the booking draft and survive resume. Hosts approve or decline requests, configure household rules and explicitly review/confirm cancellation or withdrawal. Outstanding unanswered reconfirmation remains visible as follow-up, including after planned arrival; a scheduled date alone does not prove arrival.

The [host manual](../guides/host-manual.md) covers room controls, memory deletion, calendar subscriptions and recovery.

## 9. Guest journey and access

Guests can use an invitation bearer link, a verified account with a claimed party, or a valid reminder return capability. Demo guests use a separately signed synthetic session. Server authorization binds each action to the correct household, party and invitation.

A new unbooked link normally lasts 30 days. Confirmation/rescheduling extend an unrevoked, uncancelled invitation through checkout plus seven days when necessary. No extension revives revoked or cancelled access. Demo reset renews finite link access without changing the seeded identities.

The guest checks party counts, searches, chooses exact rooms, accepts any overflow arrangement, and submits. Notes are informational; explicit requests invoke the approval policy. Requests already captured cannot be silently cleared. An interrupted request may precede hold creation. Active holds expire after 48 hours.

A natural-language change can reschedule or prepare cancellation. Explicit cancellation review must match current state at confirmation; otherwise the guest sees refreshed details. Unbooked requests can be withdrawn. Completed cancellation releases rooms, retires outstanding work and ends that invitation's guest access.

Guests reconfirm from their authorized visit. Real guests may separately consent to email, verify their address, return from reminders and opt out. A trusted verified Google address is derived server-side for a matching claimed party. GET verification only displays review; POST verifies deliberately. Return GET validates a capability and exchanges it for a guest session without reconfirming or changing a booking. Each subsequent request revalidates the capability. Address changes, opt-out, cancellation, revocation or expiry can invalidate prior access. Sign-out clears guest session cookies.

## 10. Memory, prompts and privacy

Memory has two paths: explicit SDK recall for agent context, and a bounded deterministic read for actual room ranking. Supported preferences are ground-floor, upper-floor, separate-bed and double-bed. Negated, uncertain, unsupported, conflicting or oversized recall falls back without manufacturing a preference. Matched/unmatched explanations and manual selection remain visible. A room label is not an accessibility guarantee.

Recall never overrides dates, counts, consent, requests or rules. Host capture conversations are excluded from automatic extraction; a separate deterministic capture event omits the family-name field and records bounded facts. Free-text arrival and request facts can still identify people. The assembled guest-submit prompt omits notes, arrival details and explicit request prose. Raw host and guest-change text can contain personal information and may reach the model/provider traces, so do not describe this as universal anonymization.

Guest contact data and email capabilities stay in web-owned services, outside agent prompts and agent database grants. Guest pages omit other parties' names and private room notes. Retention and authorized erasure are specified in [data lifecycle](../security/data-lifecycle.md); active work is protected while terminal notes, contacts and delivery records have defined cleanup.

## 11. Email is separate from guest response

Host pings notify pending decisions and escalations when enabled. Guest verification/reminders require explicit current consent and verified contact authority. Synthetic guest invitations do not enroll real addresses or send guest email.

Before sending, delivery rechecks source state, current cycle and consent, and records an authorized attempt. Cancellation, revocation and opt-out suppress obsolete work. A known failure and an uncertain outcome are different: an unknown provider result is not blindly retried. SES acceptance means the provider accepted the request, not that a person received or read it.

The host panel distinguishes delivery facts from an unanswered reconfirmation. Disabled delivery is reported honestly. Production activation remains subject to the [readiness document](../release/guest-email-readiness.md).

## 12. Demonstration and evidence

The canonical flow is routine Vega for four guests in both open rooms, an answered reconfirmation, then a fresh reset into Otero's two-person Garage Room explicit request. Approve that exception, chase its reconfirmation, leave it unanswered, and escalate. Cancellation closes the loop. The shared resets are visible; the scenarios are not represented as concurrent visits.

The [guided browser regression](../../tests/e2e/guided-demo.spec.ts) tests real local transitions in English and Spanish/mobile. The [benchmark report](coordination-evidence.md) records its own exact committed revision, configuration, automated operations and persisted outcomes. Neither is a human study or evidence of live-model/email behavior. Historical production traces remain separately labeled.

The [video script](video-script.md) presents this story. Recording/upload, Builder publication, final entry, production activation and participant research remain distinct owner actions.

## 13. Operational boundaries

This guide authorizes no deployment, IAM application, production migration, real email, memory seeding or external publication. Local verification precedes remote actions. Feature/develop Vercel previews must remain suppressed under repository policy.

Use the release/security runbooks for exact configuration, migrations, probes and rollback. A develop merge is not a production release. Existing historical deployment evidence should retain its original date and context.

## 14. Source index

- Agent assembly and authority: [`agent.ts`](../../src/agent/agent.ts), [`deps.ts`](../../src/agent/deps.ts), [`run-task.ts`](../../src/agent/run-task.ts), [`policy-hook.ts`](../../src/agent/policy-hook.ts).
- Booking and lifecycle: [`holds.ts`](../../src/core/booking/holds.ts), [`invitations.ts`](../../src/core/booking/invitations.ts), [`cancellation.ts`](../../src/core/booking/cancellation.ts), [`settings.ts`](../../src/core/policy/settings.ts).
- Recommendation and clock: [`room-preferences.ts`](../../src/core/memory/room-preferences.ts), [`preferences.ts`](../../src/core/rooms/preferences.ts), [`advance-clock.ts`](../../src/core/demo/advance-clock.ts).
- Follow-through and email: [`jobs.ts`](../../src/core/reconfirmation/jobs.ts), [`guest-contact.ts`](../../src/core/notifications/guest-contact.ts), [`guest-outbox.ts`](../../src/core/notifications/guest-outbox.ts).
- Review routes: [judge guide](judge-guide.md), [Strands usage](strands-usage.md), [evidence](coordination-evidence.md), [host manual](../guides/host-manual.md), [guest manual](../guides/guest-manual.md).
