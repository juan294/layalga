# Devpost draft

## Project name

L’Ayalga

## Tagline

An AI hospitality coordinator that turns informal invitations into safe stays and asks humans only for social judgment.

## Links

- Repository: `https://github.com/juan294/layalga`
- Live application: `https://layalga.thecreativetoken.com`
- Demo video: `[ADD AFTER AUTHORIZED UPLOAD]`

Do not file this entry until the live URL and video URL pass the release playbook.

## Inspiration

Shared homes have a coordination problem that ordinary calendars do not solve. One host invites a family by message. Another host makes a different plan. Dates overlap partly. Rooms, children, pets, accessibility, and the social comfort of sharing the house all matter.

L’Ayalga started from that lived pattern and generalizes it to any home with more than one host. Its purpose is not to automate human judgment. It automates the repetitive coordination around that judgment and brings people in at the exact point where context matters.

## What it does

L’Ayalga turns an informal English or Spanish invitation into a structured party and a private guest link. The guest chooses possible dates, and the system allocates rooms for the whole stay. It supports partial overlap instead of treating the whole home as simply free or busy.

Three deterministic rules protect the house:

1. Enough free beds must exist.
2. Only one family with children can overlap.
3. Pets cannot overlap unless the home explicitly allows it.

If those rules pass but the request needs social judgment, the agent pauses before the booking tool runs. A host sees the reason, approves or declines it, and the saved Strands run resumes exactly once.

After confirmation, L’Ayalga schedules a reconfirmation request for three days before arrival. If a guest does not answer within 24 hours, it alerts both hosts. A labeled synthetic clock makes that proactive flow demonstrable without faking production timestamps.

## How we built it

The application uses Next.js 16 and TypeScript 6, with `next-intl` for English and Spanish. Supabase Postgres is the authoritative store for homes, rooms, invitations, visits, room allocations, agent runs, session snapshots, pending decisions, scheduled jobs, notifications, and audit events.

The agent uses the Strands Agents TypeScript SDK with seven typed tools. Natural language helps structure invitations, choose tools, and compose bilingual follow-up. A `BeforeToolCallEvent` hook runs a pure deterministic policy before hold, confirm, and reschedule tools. PostgreSQL `daterange` and an exclusion constraint provide an independent concurrency boundary at the room level.

Strands session snapshots live in Postgres. When the hook calls `event.interrupt`, the SDK preserves the pending tool execution. A host decision is stored separately. A new process restores the session, supplies an `InterruptResponseContent`, and records which run consumed the response.

The selected hackathon deployment path uses the local `runAgentTask` adapter in Next.js on Vercel, with a per-minute Vercel Cron trigger claiming jobs from Postgres. We also built and deployed a Node 22 direct-code package to Amazon Bedrock AgentCore Runtime, and proved that the runtime reached `READY` and started the application. The first model request was blocked by an AWS account-level Anthropic use-case gate, so we followed our written fallback decision and retained the same run interface locally. The agent is configured for Amazon Bedrock Sonnet 4.5 when that account access is active. The test and demo paths use a deterministic scripted model.

## Challenges

### Preserving an interrupt across processes

A human decision can arrive long after the process that requested it has stopped. We could not keep the interrupt in memory. We implemented Strands `Storage` over Postgres and tested resume after destroying the first agent instance and after a separate Node process restored the session. The pending tool executes once after approval and never executes after decline.

### Keeping the policy outside the prompt

Beds, children, and pets are product rules, not suggestions to a model. We made the policy a pure function with a truth table and fixed precedence. The same booking transaction evaluates it again, while the database constraint handles the last concurrent race. That gives the agent useful freedom without giving it authority over invariants.

### Reliable proactive work

Scheduled delivery can fail after a job is claimed or after only one recipient is notified. We made Postgres the job authority, added claim leases, scoped notification idempotency to each scheduled job, and tested retry after partial delivery. The demo clock invokes the same tick handler as the real scheduler path.

### Cloud runtime gates

The AgentCore package reached a healthy runtime, but the AWS account rejected the first Anthropic model request before any tool call. A direct Bedrock control call returned the same error. Because the build plan defined a fail-closed local verdict, we did not claim a successful AgentCore model run. We kept the package, IAM shape, adapter, and evidence for a later retry.

## Accomplishments that we are proud of

- Partial overlap is modeled at the room and date-range level, not as a single busy flag.
- The policy truth table covers precedence, boundary dates, special requests, and concurrent room claims.
- A Strands interrupt survives a process restart and resumes without repeating its consequential tool.
- English and Spanish are present from the first screen, including agent-driven notifications.
- Synthetic demo reset is idempotent, and release probes clean only run-owned data.
- Eight executable release probes cover identity, capture, confirmation, concurrency, interrupt/resume, proactive follow-through, guest isolation, and cleanup.

## What we learned

Agents are most useful when they work above a clear authority boundary. A model is good at interpreting a message and continuing a conversation. It is a poor place to hide capacity or safety rules. Typed tools, an interruptible policy hook, transactions, and audit records make the model’s flexibility legible.

We also learned that durable human-in-the-loop behavior is a data-design problem. The decision record, the agent snapshot, and the run that consumes the decision are related, but they are not the same state. Keeping them separate made retries and audit much clearer.

Finally, a controllable clock is more than a demo shortcut. It makes proactive behavior repeatable and gives the same state machine a fast local feedback loop.

## What is next

- Complete real Google sign-in verification for hosts and optional guest claims.
- Retry Bedrock and AgentCore after the AWS account’s Anthropic use-case access is active.
- Add real notification channels only after consent, delivery, and privacy contracts are defined.
- Let hosts tune house rules while retaining a deterministic, versioned policy.
- Add per-night room packing for stays that need guests to move rooms.
- Extend the audit view so hosts can understand every automated decision in plain language.

## Built with

- Amazon Bedrock AgentCore Runtime, direct-code Node 22 spike
- Amazon Bedrock, Claude Sonnet 4.5 configuration
- AWS SDK for JavaScript
- Strands Agents SDK for TypeScript
- Next.js 16
- React 19
- TypeScript 6
- Supabase Auth and Postgres
- PostgreSQL range and exclusion constraints
- Vercel and Vercel Cron
- next-intl
- Vitest and Playwright

## Eligibility disclosure

The repository was created during the hackathon submission period. Pre-existing cc-rpi v1.28.2 files provided development-process scaffolding. All L’Ayalga product code, data design, UI, agent behavior, tests, diagrams, and submission content were created during the submission period. The demonstration uses synthetic data only.
