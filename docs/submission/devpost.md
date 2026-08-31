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

L’Ayalga turns an informal English or Spanish invitation into a structured party and a private guest link. Agent requests enter a durable queue, so the browser gets a quick acknowledgement and can follow the exact run without depending on one web request staying alive. The guest chooses possible dates and the exact rooms for the stay from the host's real inventory, with the agent recommending overflow arrangements when standard capacity runs out. Guests can stay account-free or claim their invitation with Google and review their visits. The system supports partial overlap instead of treating the whole home as simply free or busy.

Three deterministic rules protect the house:

1. Enough free beds must exist.
2. Only one family with children can overlap.
3. Pets cannot overlap unless the home explicitly allows it.

If those rules pass but the request needs social judgment, the agent pauses before the booking tool runs. A host sees the reason, approves or declines it, and the saved Strands run resumes exactly once.

After confirmation, L’Ayalga schedules a reconfirmation request for three days before arrival. If a guest does not answer within 24 hours, it alerts both hosts. A labeled synthetic clock makes that proactive flow demonstrable without faking production timestamps.

## How we built it

The application uses Next.js 16 and TypeScript 6, with `next-intl` for English and Spanish. Supabase Postgres is the authoritative store for homes, rooms, invitations, visits, room allocations, queued agent runs, session snapshots, pending decisions, scheduled jobs, notifications, identity claims, and audit events.

The agent uses the Strands Agents TypeScript SDK with ten typed tools, including guest-safe room-availability lookup and a host-facing tool that only prepares a pending room-inventory change for separate human approval. Natural language helps structure invitations, choose tools, and compose bilingual follow-up. A `BeforeToolCallEvent` hook runs a pure deterministic policy before hold, confirm, and reschedule tools. PostgreSQL `daterange` and an exclusion constraint provide an independent concurrency boundary at the room level.

Strands session snapshots live in Postgres. When the hook calls `event.interrupt`, the SDK preserves the pending tool execution. A host decision is stored separately. A new process restores the session, supplies an `InterruptResponseContent`, and records which run consumed the response.

The selected hackathon deployment path uses a durable Postgres run queue and the local `runAgentTask` worker in Next.js on Vercel. Next.js `after()` starts work opportunistically. A per-minute Vercel Cron route recovers expired leases, drains at most two runs, and claims due scheduled jobs. We also built and deployed a Node 22 direct-code package to Amazon Bedrock AgentCore Runtime. After the AWS account's Anthropic use case was accepted, the runtime completed a Sonnet 4.5 run, called the typed `capture_invitation` tool, created the private invitation, wrote its audit event, and saved its Strands session through the restricted `layalga_agent` database role. The AgentCore adapter also accepts an `execute_run` envelope for an existing queued run and uses AgentCore asynchronous-task accounting. The deterministic test and demo paths retain a scripted model.

## Challenges

### Preserving an interrupt across processes

A human decision can arrive long after the process that requested it has stopped. We could not keep the interrupt in memory. We implemented Strands `Storage` over Postgres and tested resume after destroying the first agent instance and after a separate Node process restored the session. The pending tool executes once after approval and never executes after decline.

### Keeping the policy outside the prompt

Beds, children, and pets are product rules, not suggestions to a model. We made the policy a pure function with a truth table and fixed precedence. The same booking transaction evaluates it again, while the database constraint handles the last concurrent race. That gives the agent useful freedom without giving it authority over invariants.

### Reliable proactive work

Scheduled delivery can fail after a job is claimed or after only one recipient is notified. We made Postgres the job authority, added claim leases, scoped notification idempotency to each scheduled job, and tested retry after partial delivery. The demo clock invokes the same tick handler as the real scheduler path.

The same recovery rule now applies to interactive agent work. Accepted requests are stored as queued runs with idempotency keys, bounded attempts, and expiring leases. Scheduled work retries after one and five minutes, then enters quarantine after a third failure so it cannot loop silently.

### Cloud runtime gates

The first AgentCore package reached a healthy runtime, but the AWS account rejected the initial Anthropic model request before any tool call. We followed the build plan's fail-closed local verdict and did not claim success. After the Anthropic use case was accepted, a direct Bedrock `Converse` request succeeded. The AgentCore retry exposed three additional integration boundaries: pnpm symlink expansion in ZIP artifacts, a Vercel-only `next/server` import in the runtime graph, and a PostgreSQL row lock that required more authority than the agent role should have. We fixed the package layout, removed the cross-runtime import, replaced the row lock with a transaction advisory lock, and completed the model-and-tool proof without granting the agent permission to change home policy.

## Accomplishments that we are proud of

- Partial overlap is modeled at the room and date-range level, not as a single busy flag.
- The policy truth table covers precedence, boundary dates, special requests, and concurrent room claims.
- A Strands interrupt survives a process restart and resumes without repeating its consequential tool.
- English and Spanish are present from the first screen, including agent-driven notifications.
- Synthetic demo reset is idempotent, and release probes clean only run-owned data.
- Eight executable release probes cover identity, capture, confirmation, concurrency, interrupt/resume, proactive follow-through, guest isolation, and cleanup.
- Host and guest requests survive web-request termination through exact-run polling and lease recovery.
- Runtime database access is split between non-owner web and agent roles with explicit grants.
- A live AgentCore Runtime completed a Sonnet 4.5 run and left matching invitation, tool-audit, and session records in Postgres.

## What we learned

Agents are most useful when they work above a clear authority boundary. A model is good at interpreting a message and continuing a conversation. It is a poor place to hide capacity or safety rules. Typed tools, an interruptible policy hook, transactions, and audit records make the model’s flexibility legible.

We also learned that durable human-in-the-loop behavior is a data-design problem. The decision record, the agent snapshot, and the run that consumes the decision are related, but they are not the same state. Keeping them separate made retries and audit much clearer.

Finally, a controllable clock is more than a demo shortcut. It makes proactive behavior repeatable and gives the same state machine a fast local feedback loop.

## What is next

- Verify Google host and optional guest sign-in against the deployed production candidate.
- Run the full interrupt-and-resume acceptance sequence on the verified AgentCore runtime before selecting it for production dispatch.
- Add real notification channels only after consent, delivery, and privacy contracts are defined.
- Let hosts tune house rules while retaining a deterministic, versioned policy.
- Add per-night room packing for stays that need guests to move rooms.
- Extend the audit view so hosts can understand every automated decision in plain language.

## Built with

- Amazon Bedrock AgentCore Runtime, direct-code Node 22 runtime
- Amazon Bedrock, Claude Sonnet 4.5
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

The repository was created during the hackathon submission period. Pre-existing cc-rpi v1.28.2 files provided development-process scaffolding. All L’Ayalga product code, data design, UI, agent behavior, tests, diagrams, and submission content were created during the submission period. The two host names identify the real operators; all guest identities, invitations, visits, and notifications in the demonstration are synthetic.
