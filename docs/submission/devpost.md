# L’Ayalga — Devpost draft

Status: v1.3.9 derives resumed-run results from recorded decisions and verified request context, safely formats public agent results, and prevents interrupted-run internals from appearing in the interface. The broader coordination behavior was proven in production v1.3.2 at commit `90b68385a590144d6d44cd7dd41298180b2d182c` on 11 September 2026. The exact Vercel and AgentCore candidate passed the protected guided demo and all nine production probes. The public video URL and final Devpost submission remain pending.

## Tagline

An AI hospitality coordinator that handles routine stays, asks people about exceptions, and follows through before guests arrive.

## Inspiration

A shared household can receive invitations through several people and channels. Dates are only part of the work: someone must check rooms, children and pets, notice special requests, keep both hosts informed, and ask whether the guests are still coming.

L’Ayalga turns that coordination into an explicit workflow. The intended audience is households that host friends and family, especially when more than one person invites independently. We have not measured adoption or human time saved; the [evidence report](coordination-evidence.md) separates synthetic workflow measurements from the [planned participant baseline](participant-protocol.md).

## What it does

A host pastes an invitation. The agent structures it and the application prepares a private guest link after that exact run completes. The host copies and sends it through their chosen channel.

Guests search feasible dates and exact rooms. Ordinary informational notes stay attached to the visit without creating an approval task. An explicit request or documented overflow arrangement pauses for a host decision. Hosts can configure versioned children/pets rules; capacity and occupancy remain enforced in code and PostgreSQL. Approval resumes the saved execution only after checking the current state again.

When usable household memory exists, supported ground-floor, upper-floor, separate-bed and double-bed preferences rank valid room sets. Guests can inspect matched and unmatched preferences or choose another valid set. Missing or conflicting memory produces a clear fallback, and no preference becomes an unrequested policy exception.

The coordinator requests reconfirmation before arrival and escalates unanswered requests. Real guests can opt into verified email reminders, return securely to their visit, and opt out. Delivery failure and uncertain provider outcomes are distinguished from a guest who has not replied. Synthetic guest scenarios do not send email.

Guests and hosts can explicitly cancel a reviewed stay or withdraw an unbooked request. Natural language can prepare cancellation, but cannot commit it. Cancellation releases rooms and retires stale decisions, runs, jobs and queued delivery. Valid invitation access extends through checkout plus seven days when needed; cancelled or revoked access never revives.

## How we built it

The Strands Agents TypeScript SDK supplies the agent loop, typed tools, a policy hook, durable interruption/resumption, session storage and memory integration. Amazon Bedrock supplies Claude Sonnet 4.6. Production uses Amazon Bedrock AgentCore Runtime version 30, AgentCore Memory and CloudWatch observability; [Strands usage](strands-usage.md) maps the implementation precisely.

Next.js queues work and presents English/Spanish host and guest journeys. Each AgentCore invocation stays open until its claimed work settles. Operational claims, heartbeats, deadlines and recovery use PostgreSQL wall time, while the synthetic household clock drives only the visible visit scenario. Supabase PostgreSQL remains authoritative for rooms, invitations, bookings, policy versions, decisions, jobs and capabilities. Non-owner database roles separate web delivery authority from agent execution. The agent cannot read guest contact addresses or send guest email. SES delivery is implemented through a web-owned outbox with authorized attempt receipts.

Raw host text can contain names and is processed by the model. Capture conversations are excluded from memory extraction. Guest-submission notes, arrival details and request prose stay out of assembled model prompts; memory recommendations use a bounded, party-scoped read. See the [privacy lifecycle](../security/data-lifecycle.md) for the boundaries and retention rules.

## Challenges and lessons

The difficult part was preserving authority across time. A host may approve after availability changes, a guest may cancel while a run is working, and a reminder may be claimed while consent is withdrawn. Database locking, current-state validation and explicit delivery receipts make these races visible and testable.

We also separated language that conveys information from language asking someone to decide. A thank-you should not interrupt a routine stay. A remembered preference should improve a recommendation without silently changing the guest's request.

## What we are proud of

The guided demo now begins with a complete routine stay, then shows a fresh exception and durable follow-through. Decisions and current outcomes are prominent for hosts. The same product includes clear recovery for stale reviews, expired holds, disabled memory and failed delivery.

The [synthetic benchmark](coordination-evidence.md) records actual automated operations and database outcomes with its exact revision and configuration. It does not claim human savings, general model quality or inbox delivery. The [v1.3.2 protected production workflow](https://github.com/juan294/layalga/actions/runs/34583050263) separately ran the guided demo and all nine probes against the exact Vercel and AgentCore commit, including memory, host SES acceptance, concurrency, interruption, guest isolation and cleanup.

## What comes next

The immediate remaining work is recording/upload and final submission, optional publication of the three Builder drafts, guest-email activation with a consenting real-recipient proof, and a measured participant study. The [guest email readiness checklist](../release/guest-email-readiness.md) identifies the unapplied permission and operational verification.

Broader channels such as WhatsApp/SMS and changing rooms midway through a stay remain deferred ideas. Household policy configuration, consented guest reminders, cancellation and remembered room recommendations are already implemented and are not future roadmap promises.

## Try it and review it

- [Canonical judge guide](judge-guide.md): repository-only review and reproducible synthetic journey.
- [Live site](https://layalga.thecreativetoken.com): v1.3.9 release; broader coordination behavior was proven with the v1.3.2 candidate at commit `90b68385`.
- [Public repository](https://github.com/juan294/layalga): MIT licensed.
- [Architecture](../architecture/README.md), [host manual](../guides/host-manual.md), [guest manual](../guides/guest-manual.md).
- AWS Builder Center: [deterministic household policy](https://builder.aws.com/content/3JDQAfyHGB6qjJ0jAxwcnaCdRUk/agents-for-humans-deterministic-household-policy-under-a-strands-agent), [durable interrupts](https://builder.aws.com/content/3JDQsaSl4Yucs12mbJpXOyRCj5b/agents-for-humans-durable-interrupts-for-household-decisions), and [proactive follow-through](https://builder.aws.com/content/3JDR9dE9hJBcB4SItqBUl0GqL01/agents-for-humans-testing-proactive-follow-through-with-an-honest-clock).
- Audio overviews: [SoundCloud playlist](https://soundcloud.com/juan-gonzalez-72390307/sets/layalga).
- Video: not yet recorded/uploaded; final URL pending owner action.
- AWS Builder ID, Everyday Agents track, repository, architecture, and live-demo fields are populated; final submission remains pending.

## Testing instructions

Open the live demo in English or Spanish. On the sign-in page, use either synthetic host button; no Google account is required. Start **Vega** in the guided panel, search for four guests with both open rooms, add an informational thank-you, and submit to see a routine AgentCore booking complete. Advance to the next guest reminder, return as Vega, and answer **Yes, we are coming**.

Then start **Parker**. This visibly resets the shared synthetic home. Select the Garage Room, submit the preserved explicit request, and approve the resulting host decision. Advance to the next guest reminder without answering, then advance to the next host follow-up. The host sees the unresolved escalation. Each scenario reset affects other viewers using the shared demo; finish one route before starting another. Synthetic guest email is always suppressed.

## Built with

Strands Agents TypeScript SDK, Amazon Bedrock, Claude Sonnet 4.6, Amazon Bedrock AgentCore Runtime and Memory, Amazon CloudWatch, Amazon SES, Next.js, TypeScript, Supabase PostgreSQL/Auth, Vercel, OpenTelemetry and WebMCP integration where the browser exposes its API.
