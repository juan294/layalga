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

If those rules pass but the request needs social judgment, the agent pauses before the booking tool runs. A host sees the reason, approves or declines it, and the saved Strands run resumes exactly once. That decision, and every reconfirmation escalation, also lands as an email in the host's inbox through Amazon SES, so a host does not have to be watching the app to act on it.

After confirmation, L’Ayalga schedules a reconfirmation request for three days before arrival. If a guest does not answer within 24 hours, it alerts both hosts. A labeled synthetic clock makes that proactive flow demonstrable without faking production timestamps.

Every agent run — capturing an invitation, offering room options, following up before arrival — now executes on a live Amazon Bedrock AgentCore Runtime, with OpenTelemetry traces of each agent cycle, model call, and tool call visible in CloudWatch GenAI Observability. The coordinator also remembers a returning family across invitations: arrival habits, room needs, pets, and accessibility needs recalled through Strands `MemoryManager` over AgentCore Memory, without ever writing or sending the family's name. A host can see, and erase, everything remembered about a family from the host page.

## How we built it

The application uses Next.js 16 and TypeScript 6, with `next-intl` for English and Spanish. Supabase Postgres is the authoritative store for homes, rooms, invitations, visits, room allocations, queued agent runs, session snapshots, pending decisions, scheduled jobs, notifications, identity claims, and audit events.

The agent uses the Strands Agents TypeScript SDK with ten typed tools, including guest-safe room-availability lookup and a host-facing tool that only prepares a pending room-inventory change for separate human approval. Natural language helps structure invitations, choose tools, and compose bilingual follow-up. A `BeforeToolCallEvent` hook runs a pure deterministic policy before hold, confirm, and reschedule tools. PostgreSQL `daterange` and an exclusion constraint provide an independent concurrency boundary at the room level.

Strands session snapshots live in Postgres. When the hook calls `event.interrupt`, the SDK preserves the pending tool execution. A host decision is stored separately. A new process restores the session, supplies an `InterruptResponseContent`, and records which run consumed the response.

Next.js on Vercel accepts work into a durable Postgres run queue and acknowledges it immediately; a per-minute Vercel Cron route recovers expired leases, drains queued runs, and claims due scheduled jobs. Selected production dispatch sends every queued run to a live Amazon Bedrock AgentCore Runtime — a Node 22 direct-code deployment running the same Strands agent, called through `InvokeAgentRuntime` with an `execute_run` envelope, connected to Postgres through the separately granted `layalga_agent` database role. `AGENT_RUNTIME=local` remains a one-flag rollback to the Vercel-only path; the deterministic test and demo paths keep a scripted model regardless of runtime.

The AgentCore runtime also carries the agent's two supporting systems. ADOT for Node auto-instruments every run, so Strands' own OpenTelemetry spans (agent cycle, model call, tool call) reach CloudWatch GenAI Observability with no code change to the agent. Strands `MemoryManager`, backed by AgentCore Memory, gives the agent a `search_memory` tool over one namespace per family, written by two extraction strategies over invitations and confirmed visits; recall is tool-driven, never injected into the prompt, and the family name never enters a memory record because the capture and guest prompts omit it at the source. Separately, on the Vercel side, an idempotent email outbox sends a host-only decision or escalation ping through Amazon SES whenever a run pauses or a reconfirmation escalates.

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
- Nine executable release probes cover identity, capture, confirmation, concurrency, interrupt/resume, proactive follow-through, guest isolation, cleanup, and the runtime that executed each run.
- Host and guest requests survive web-request termination through exact-run polling and lease recovery.
- Runtime database access is split between non-owner web and agent roles with explicit grants.
- The live AgentCore Runtime is the selected production path, not just a proof: every run since has executed there, with its runtime recorded on the run itself and shown on a per-run timeline of tool calls and policy verdicts.
- Household memory recall never sees or stores a family name, and a host can erase a family's memory as completely as it was written.

## What we learned

Agents are most useful when they work above a clear authority boundary. A model is good at interpreting a message and continuing a conversation. It is a poor place to hide capacity or safety rules. Typed tools, an interruptible policy hook, transactions, and audit records make the model’s flexibility legible.

We also learned that durable human-in-the-loop behavior is a data-design problem. The decision record, the agent snapshot, and the run that consumes the decision are related, but they are not the same state. Keeping them separate made retries and audit much clearer.

Finally, a controllable clock is more than a demo shortcut. It makes proactive behavior repeatable and gives the same state machine a fast local feedback loop.

## What is next

- Add real notification channels beyond host-only email only after the same consent, delivery, and privacy contracts already applied to email.
- Let hosts tune house rules while retaining a deterministic, versioned policy.
- Add per-night room packing for stays that need guests to move rooms.
- Extend the audit view so hosts can understand every automated decision in plain language.
- Widen memory recall beyond the current preference and fact strategies as more return-visit patterns are observed.

## Testing instructions

1. Open `https://layalga.thecreativetoken.com`. On the sign-in page, press "Enter as Host" to enter the demo house without Google OAuth (switch the page language to Spanish or English at the top); the banner reads `Synthetic demo` throughout. "Enter as Guest" opens a prepared guest invitation the same way.
2. Beat 1: as Juan, paste a Spanish invitation for a synthetic family. The agent structures the party, and the run status page and the embedded poller show each tool call and policy verdict as it happens.
3. Beat 2: ask the coordinator to reserve a room for private household use, review the prepared proposal, and apply it.
4. Beat 3: open the private guest link in a separate window, select dates and rooms, and try both a standard-capacity choice and an overflow-only choice; the overflow choice pauses for a host decision, which appears on the host page and arrives as an email to both hosts if `EMAIL=ses` is active on the deployed candidate.
5. Beat 4: issue a revocable calendar feed from the host page and move the labeled synthetic clock forward to see reconfirmation, then escalation; each host escalation also sends an email under the same condition as beat 3.
6. Expect at most two emails per beat pair (one per host), always addressed to a host, never to a guest; expect none if the deployed candidate has `EMAIL=none`.
7. On the host page, open "What L'Ayalga remembers" to see recall for a family with a prior invitation, and use Forget to erase it.

## Built with

- Amazon Bedrock AgentCore Runtime, direct-code Node 22 runtime, selected production execution path
- Amazon Bedrock, Claude Sonnet 4.5
- Amazon Bedrock AgentCore Memory
- Amazon Bedrock AgentCore Observability (ADOT for Node, CloudWatch GenAI Observability)
- Amazon SES
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

The repository was created during the hackathon submission period. Pre-existing cc-rpi files (v1.28.2 at bootstrap, synced to v1.29.0 on 2026-09-01) provided development-process scaffolding. All L’Ayalga product code, data design, UI, agent behavior, tests, diagrams, and submission content were created during the submission period. The two host names identify the real operators; all guest identities, invitations, visits, and notifications in the demonstration are synthetic.
