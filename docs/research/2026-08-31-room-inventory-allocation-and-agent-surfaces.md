# Research: Room Inventory, Allocation, and Agent Surfaces

> Researched on 2026-08-31. This document describes the current repository. It does not propose changes.

## Research question

What room inventory, room allocation, host controls, guest choices, calendar integration, messaging, and agent access exist in L’Ayalga today?

## Summary

L’Ayalga has a generic room and allocation model, but it does not contain the real layout of the owners' house. The only concrete inventory is a synthetic demo home with three invented rooms and seven total beds (`supabase/seed.sql:9-45`). The original design brief states that the hosts had not supplied the real inventory and that the demo seed would stand in for it (`docs/research/2026-08-29-layalga-brief.md:164-172`).

The application allocates rooms automatically. Guests choose dates and party details but do not choose rooms. Hosts can see assigned room names in the calendar, but the host surface has no room-management or manual-block action. The repository has no Telegram, WebMCP, MCP server, iCalendar, ICS, CalDAV, or external user-calendar implementation.

## Room inventory

The `rooms` table belongs to one home and stores only an identifier, home identifier, name, bed count, and creation time (`supabase/migrations/20260831000100_core.sql:12-19`; `src/core/db/schema.ts:85-93`). It has no floor, bed-type configuration, accessibility metadata, guest-visible description, active state, or manual-block field.

The demo seed deletes and recreates `Casa Ayalga` as a demo home and inserts three synthetic rooms: `Cuartu del Horreu` with two beds, `Cuartu de la Fonte` with two beds, and `Cuartu del Teixu` with three beds (`supabase/seed.sql:9-45`). The implementation plan identifies these values as the fixed synthetic fixture used by `supabase/seed.sql` and the demo reset (`docs/plans/2026-08-29-layalga-hackathon-build.md:348-375`).

The design brief records the unresolved real-world boundary: house inventory was host-configured seed data, while only the demo values were fixed in the original plan (`docs/research/2026-08-29-layalga-brief.md:164-172`).

## Room assignment and concurrency

A visit stores a half-open date range, party counts, requests, booking status, hold expiry, confirmation and reconfirmation timestamps, and an approval hash (`src/core/db/schema.ts:167-200`). `visit_rooms` links a visit to one or more rooms for the same half-open stay range (`src/core/db/schema.ts:202-215`).

PostgreSQL rejects overlapping assignments for the same room with a GiST exclusion constraint and rejects duplicate room assignment within one visit (`supabase/migrations/20260831000100_core.sql:83-92`). Composite foreign keys also require the visit, room, and allocation to belong to the same home (`supabase/migrations/20260831000900_relationship_tenants.sql:1-19`).

The house-state loader reads all rooms for the home and the room identifiers used by active overlapping visits (`src/core/booking/house-state.ts:12-61`). The allocation function sorts available rooms by descending bed count, keeps stable input order for equal sizes, and takes whole rooms until `adults + children` fit (`src/core/policy/allocate-rooms.ts:7-40`). The overlap policy removes occupied rooms before allocation, then evaluates beds, children, pets, and special requests in a fixed order (`src/core/policy/evaluate-overlap.ts:82-130`).

Hold creation takes a home-scoped transaction lock, expires old holds, reevaluates current house state, inserts a 48-hour hold, and writes each computed room allocation in one transaction (`src/core/booking/holds.ts:115-195`; `src/core/booking/holds.ts:687-705`). Confirmation rechecks policy before it changes a hold to confirmed (`src/core/booking/holds.ts:198-267`). Rescheduling removes the old room rows and writes a new computed allocation in the same transaction (`src/core/booking/holds.ts:332-442`).

The current algorithm holds the same rooms for the complete visit. The original plan explicitly excludes per-night packing and room changes during a stay (`docs/plans/2026-08-29-layalga-hackathon-build.md:107-115`).

## Guest surface

The guest page loads one invitation capability and either shows its booking flow or the latest visit (`src/app/[locale]/g/[token]/page.tsx:25-131`). Its option result contains a stay, room count, and anonymous overlap flag, not room identifiers or names (`src/app/[locale]/g/[token]/actions.ts:56-60`).

The guest first searches a date window and visit length. The booking form then selects one date option and collects adults, children, pets, arrival time, and notes (`src/components/guest/guest-invite-form.tsx:68-118`; `src/components/guest/guest-invite-form.tsx:138-207`). The submitted `guest_submit` task has no room field (`src/app/[locale]/g/[token]/actions.ts:153-166`; `src/agent/task.ts:30-41`).

After booking, guest data computes and shows the number of assigned rooms but not their names (`src/app/[locale]/g/[token]/guest-data.ts:71-107`; `src/app/[locale]/g/[token]/page.tsx:146-167`). This matches the current privacy contract that guest views do not reveal room names (`README.md:127-133`).

## Host surface

The host page requires an authenticated or signed demo host and scopes its queries to that host's home (`src/app/[locale]/(host)/page.tsx:75-105`; `src/lib/auth/current-host.ts:30-60`). It loads active visits with assigned room names, pending decisions, audit events, and host notifications (`src/app/[locale]/(host)/page.tsx:105-189`).

The host calendar receives room names for each visit (`src/app/[locale]/(host)/page.tsx:191-198`). Its visual ledger shows room count and exposes names in the item title; its semantic agenda lists the names directly (`src/components/host/calendar-ledger.tsx:121-175`; `src/components/host/calendar-ledger.tsx:185-207`).

The current host panels are the visit calendar, pending decisions, invitation capture, activity, and demo-clock control (`src/app/[locale]/(host)/page.tsx:313-430`). The host action module supports invitation capture, private-link reveal, and approval or decline of pending decisions (`src/app/[locale]/(host)/actions.ts:35-180`). It has no action to create, edit, disable, or block a room.

## Agent workflow and authority

One sequential Strands agent receives seven typed tools: capture invitation, find visit options, evaluate overlap, create a temporary hold, confirm a visit, reschedule a visit, and write an in-app notification (`src/agent/deps.ts:16-25`; `src/agent/agent.ts:24-39`). Accepted task kinds are host capture, guest submit, guest change, guest reconfirmation, host resume, and scheduled tick (`src/agent/task.ts:22-74`).

The temporary-hold tool accepts dates and party facts but no room preference; it returns the rooms computed by the booking layer (`src/agent/tools/create-temporary-hold.ts:18-50`). The reschedule tool also reallocates rooms rather than accepting room choices (`src/agent/tools/reschedule-visit.ts:17-53`).

A `BeforeToolCallEvent` hook gates hold creation, confirmation, and rescheduling. It reloads authoritative house state, records the policy verdict, denies hard conflicts, and interrupts for a host decision when a special request exists (`src/agent/policy-hook.ts:16-72`). Tool helpers recheck home, invitation, and visit authority before data access (`src/agent/tools/shared.ts:28-118`).

Runs are stored before execution, use actor-scoped sessions, have bounded retries and leases, and support exact-run polling (`src/agent/run-task.ts:31-126`; `src/agent/run-task.ts:359-509`; `src/agent/run-task.ts:682-813`). The local runtime uses Next.js `after()` for opportunistic work, while the cron route recovers due work and drains at most two runs (`src/agent/runtime/local.ts:21-47`; `src/app/api/ticks/route.ts:12-29`). AgentCore accepts the same existing queued-run envelope (`src/agent/runtime/agentcore.ts:21-69`).

## Messaging and external calendars

The `notify` tool writes bilingual rows to the application's `notifications` table after it validates home, visit, scheduled job, recipient, and recipient kind (`src/agent/tools/notify.ts:9-102`; `supabase/migrations/20260831000300_scheduling.sql:14-25`). Reconfirmation delivery and escalation are therefore in-app notifications (`src/core/reconfirmation/jobs.ts:660-697`).

The original scope excludes WhatsApp, Twilio, SMS, and email delivery (`docs/research/2026-08-29-layalga-brief.md:61-71`). The submission document lists real notification channels as future work after consent, delivery, and privacy contracts exist (`docs/submission/devpost.md:89-96`).

The user-facing calendar is an internal monthly ledger derived from visits and room allocations (`src/app/[locale]/(host)/page.tsx:99-124`; `src/components/host/calendar-ledger.tsx:31-54`). The scheduler adapter is for AgentCore/EventBridge jobs, not for a host calendar (`src/agent/scheduler/index.ts:34-95`; `src/core/reconfirmation/jobs.ts:699-755`). A repository-wide search found no Telegram, WebMCP, MCP server, iCalendar, ICS, CalDAV, Google Calendar, or Apple Calendar implementation.

## Authentication and privacy boundaries

Hosts authenticate through Supabase and an explicit email-to-host mapping; signed demo cookies are a separate path for demo homes (`src/lib/auth/current-host.ts:30-60`; `src/lib/auth/host-identity.ts:5-62`). Invitation URLs use random capability tokens while the database stores only an HMAC; lookup rejects cancelled, revoked, or expired invitations (`src/core/booking/invitations.ts:50-63`; `src/core/booking/invitations.ts:194-248`).

Guests can claim their invitation through Google without gaining access to another party's records (`src/lib/auth/party-claim.ts:6-21`; `src/lib/auth/guest-account.ts:19-73`). Exact-run readback requires either the invitation capability for that run or a host from the same home (`src/app/api/runs/run-data.ts:15-65`). Provider prompt minimization removes known host and family identities and selected free text before model execution (`src/agent/prompt-minimization.ts:11-18`).

## Existing verification

The policy suite covers capacity, children, pets, special-request interrupts, hold state, cancellation, and half-open boundary dates (`src/core/policy/evaluate-overlap.test.ts:56-231`). Database-backed tests cover concurrent last-room races, the exclusion constraint, atomic confirmation, rescheduling, cancellation, and expired-hold release (`src/core/booking/holds.concurrency.test.ts:117-270`).

Agent tests cover interrupt persistence, exact approval application, cross-process resume, decline, and rescheduling (`src/agent/interrupt-resume.test.ts:38-203`; `src/agent/reschedule.test.ts:21-117`). Playwright covers guest booking and host capture/approval (`tests/e2e/guest-link.spec.ts:5-28`; `tests/e2e/host-view.spec.ts:22-63`).

## Historical boundary

The original product position distinguishes agentic coordination from the calendar: proactive follow-up, reschedule negotiation, and host interrupts are the agent surfaces, while the calendar is an output (`docs/research/2026-08-29-agents-for-humans-hackathon-assessment.md:58-73`; `README.md:8-17`). The repository keeps booking authority in code and PostgreSQL rather than in the model (`README.md:27-37`).

The original plan and core implementation entered history separately: commit `aece593` added the brief and plan with the synthetic-inventory boundary, and commit `afc6a97` added the schema, allocation policy, holds engine, tests, and seed. At the time of this research, `develop` is at `d80fda4`, one local commit ahead of `origin/develop` at `65d0c13`; `origin/main` is `9b18e5c`, tagged `v0.1.2`.
