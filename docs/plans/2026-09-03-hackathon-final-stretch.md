# Plan: Hackathon final stretch (AgentCore live, tracing, run timeline, host email pings, returning-guest memory, submission)

Date: 2026-09-03
Research: `docs/research/2026-09-03-hackathon-readiness-and-strands-leverage.md`
Deadline: Devpost submission 2026-09-14 17:00 PDT (2026-09-15 02:00 Europe/Madrid). Target filing: 2026-09-13.

Evidence labels: VERIFIED = read in code or docs this session. DECIDED = owner decision recorded on 2026-09-03. INFERRED = judgment.

## 1. Acceptance criterion

The plan is complete when all of the following hold against the production URL `https://layalga.thecreativetoken.com`:

1. Production dispatches agent runs to a live Amazon Bedrock AgentCore Runtime (`AGENT_RUNTIME=agentcore`), the nine release probes pass with `--commit <sha>`, and the interrupt-and-resume run is proven on AgentCore by the run record itself (`result.executedOn = "agentcore"`) and by the runtime CloudWatch log group.
2. A Strands run on AgentCore produces GenAI spans visible in CloudWatch GenAI Observability.
3. The run status page shows a per-run timeline of tool calls, policy verdicts, and applied decisions, plus the runtime that executed the run.
4. A pending host decision and a reconfirmation escalation each produce one email per consenting host through Amazon SES, exactly once, and a host can switch pings off.
5. A returning family's preferences are recalled by the coordinator through Strands `MemoryManager` over AgentCore Memory, a host can see and erase what is remembered, and no guest can read another party's memory.
6. README, ADR 0002, release playbook, architecture diagram, data-lifecycle doc, Devpost draft, and video script describe the shipped state; the video is recorded from the shipped state.

## 2. Decisions recorded by this plan (DECIDED 2026-09-03)

| # | Decision | Consequence |
| --- | --- | --- |
| D1 | Production web dispatch switches to AgentCore once Phase 0 probes pass. | `AGENT_RUNTIME=agentcore`, `AGENTCORE_RUNTIME_ARN` in Vercel production; one-flag rollback to `local`. |
| D2 | SES sender is the domain `thecreativetoken.com`; both hosts receive pings. | Easy DKIM CNAMEs at the DNS host; both host addresses verified as sandbox recipients; a verified single address is the fallback sender if DKIM is not verified by Phase 2 day end. |
| D3 | Feature-branch pushes and PRs against `develop` are pre-authorized. Merges to `develop`, promotion to `main`, tags, and production deploys are asked separately. | Each phase ends with an open PR and a background CI monitor. |
| D4 | Production already runs `MODEL=bedrock` (switched and verified 2026-09-03). | Phase 0 keeps it; the AgentCore runtime env sets `MODEL=bedrock` explicitly. |
| D5 | No WhatsApp or Twilio. Email is the only outbound channel, host-only, never guests. | SES IAM condition pins recipients to the two verified host addresses. |
| D6 | Memory injection into prompts is off; recall is tool-driven (`search_memory`). | Preserves the anchored prompt-minimization regexes (VERIFIED `src/agent/prompt-minimization.ts:11-19`). |
| D7 | Family names never enter memory records or provider prompts. | Guest-task prompts drop the family name at the source (the provider never saw it anyway); host-capture memory is written deterministically without names. |
| D8 | Tracing runs only on the AgentCore runtime, through ADOT auto-instrumentation. | Vercel functions are not instrumented; with D1 all agent runs execute on AgentCore. |

## 3. Constraints from research (VERIFIED)

- `infra/iam/web-bedrock-policy.json` grants no `bedrock-agentcore:InvokeAgentRuntime`; under `agentcore` every enqueue dispatch fails silently and runs sit queued until cron (`src/agent/client.ts:54-59`).
- `/api/demo/clock` calls `runDueJobs` with `AgentCoreClient.run`, which returns `accepted` before delivery; `deliveryIsComplete` then throws (`src/core/reconfirmation/jobs.ts:342-351`, `src/agent/runtime/agentcore.ts:52-69`).
- `runtimeDeps` calls `parseServerEnvironment()`; an AgentCore env without `MODEL=bedrock` silently uses the scripted model and without `APP_URL` writes `http://localhost:3008` links (`src/agent/runtime/deps.ts:11,25-27`, `src/lib/server/env.ts:69,79`).
- Probe 4 polls for 10 s after one drain (`scripts/release-probes.ts:432-455`); cold AgentCore starts were 33 to 66 s.
- `AgentCoreMemoryStore` has `search` and `addMessages` only, no `add`; writes reach AgentCore through extraction (`bedrock-agentcore/dist/src/memory/integrations/strands/store.d.ts:8-27`). `MemoryManager.flush()` is required at the end of a one-shot run.
- `AgentAuthority` has no `partyId` (`src/agent/ports.ts:15-30`).
- `@strands-agents/sdk/telemetry` needs six `@opentelemetry/*` packages that are not installed; `Agent` picks up any global tracer provider automatically.
- Hosts have no email column; the address is `host_identity_claims.normalized_email`, readable by `layalga_web_runtime` only.
- The web runtime may `update` only `hosts.auth_user_id`; consent needs a new table.
- SES sandbox: verified recipients only, 200 per day, 1 per second. No production access needed.
- AgentCore Memory IAM prefix is `bedrock-agentcore:` for both planes. `eventExpiryDuration` is an integer of days. Strategy enum is `SUMMARIZATION`.
- `create-memory` takes 2 to 3 minutes; extraction after `CreateEvent` takes minutes and is not documented.

## 4. Architecture after this plan

```
host / guest browser
   │ Server Actions, /api/agent/run, /api/runs/[id] (+ timeline)
   ▼
Next.js on Vercel (layalga_web role, AWS creds: layalga-web user)
   ├─ enqueue run row ──► InvokeAgentRuntime {execute_run} ──► AgentCore Runtime (layalga_agent role)
   ├─ cron /api/ticks: lease recovery, drain, due jobs, email outbox      │ Strands Agent + MemoryManager
   ├─ email outbox ──► Amazon SES (host pings, consent table)              │ ADOT ──► CloudWatch GenAI Observability
   └─ memory panel ──► AgentCore Memory (list / batch delete)              └─ search_memory ──► AgentCore Memory
Supabase Postgres: runs, audit_events (timeline source), pending_decisions, notifications,
                   host_email_pings, host_notification_settings
```

## 5. Phases

| Phase | Title | Depends on | Batch |
| --- | --- | --- | --- |
| 0 | AgentCore runtime live and selected for production dispatch | AWS profile on this machine | — |
| 1 | Per-run agent timeline on the run status page | 0 (for `executedOn`; UI works with local too) | `[batch-eligible]` with 4 |
| 2 | Host email pings through Amazon SES | 0 (cron path), AWS profile | — |
| 3 | Returning-guest memory through Strands MemoryManager and AgentCore Memory | 0, 2 (shares `env.ts`, host page, messages) | — |
| 4 | OpenTelemetry tracing from the AgentCore runtime | 0 | `[batch-eligible]` with 1 |
| 5 | Documentation, diagram, Devpost, video, posts, release | 1 to 4 | — |

Phases 1 and 4 touch disjoint files (1: API route, poller, labels, messages, host page import; 4: `package.json`, bundle script, deploy script env, runtime entry). Phases 2 and 3 both touch `src/lib/server/env.ts`, `messages/*.json`, and the host page, so they run sequentially.

## 6. Schedule (Europe/Madrid)

| Date | Work |
| --- | --- |
| 2026-09-04 | Phase 0 |
| 2026-09-05 | Phase 1 and Phase 4 in parallel |
| 2026-09-06 | Phase 2 (DKIM records requested on 09-04 so they are verified by now) |
| 2026-09-07 to 09-08 | Phase 3 |
| 2026-09-09 to 09-11 | Phase 5: docs, diagram, video recording, posts published, Devpost drafted |
| 2026-09-12 | Buffer, full release gate on the exact candidate |
| 2026-09-13 | File the Devpost entry |

## 7. Verification commands (run sequentially after each phase)

```bash
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run build
pnpm run test:e2e
pnpm run demo:e2e -- --base http://127.0.0.1:3008
pnpm run release:probes -- --base https://layalga.thecreativetoken.com --commit <sha>
```

Database-backed suites need the local Supabase stack (`pnpm run db:start`, `pnpm run db:reset`) and the CI env values from `.github/workflows/ci.yml:75-86`.

## 8. Automated success criteria

| # | Criterion | Artifact |
| --- | --- | --- |
| A1 | Release probe 5 asserts `result.executedOn === "agentcore"` when run with `--expect-runtime agentcore`. | `scripts/release-probes.ts` (Phase 0) |
| A2 | Demo clock under `AGENT_RUNTIME=agentcore` completes synchronous ticks. | `src/agent/client.test.ts` new case (Phase 0) |
| A3 | `/api/runs/[id]` returns ordered timeline events for the run's audit rows only, under both auth branches. | `src/app/api/runs/run-data.test.ts` (Phase 1) |
| A4 | Timeline renders one row per event with localized labels for all 10 tool names. | `src/components/runs/run-timeline.test.tsx` (Phase 1) |
| A5 | Email outbox sends exactly one email per host per decision and per escalation, skips hosts with consent off, and is idempotent on re-run. | `src/core/notifications/email-outbox.integration.test.ts` (Phase 2) |
| A6 | Health stays `ok` with `EMAIL=none` and reports `SES_FROM_ADDRESS` missing when `EMAIL=ses`. | `src/lib/server/env.test.ts` (Phase 2) |
| A7 | Memory stores are attached only for tasks with party authority; host tasks read the home subtree; guest tasks read one party subtree; no store is writable for host room requests. | `src/agent/memory.test.ts` (Phase 3) |
| A8 | Guest-task prompts contain no family name. | `src/agent/prompt-minimization.test.ts` extended (Phase 3) |
| A9 | Forget action deletes every listed record and event for one party and writes a `memory_forgotten` audit event. | `src/core/memory/forget.test.ts` with a fake client (Phase 3) |
| A10 | Bundle starts with ADOT registered and Strands spans are emitted to an in-process exporter in a unit test. | `src/agent/telemetry.test.ts` (Phase 4) |

## 9. Manual success criteria

| # | Criterion |
| --- | --- |
| M1 | `aws logs tail /aws/bedrock-agentcore/runtimes/<id>-DEFAULT` shows the resume run; `select current_user` evidence shows `layalga_agent`. |
| M2 | CloudWatch GenAI Observability shows an agent trace with model and tool spans for one production run. |
| M3 | Both hosts receive one pending-decision email and one escalation email during the four-beat demo; the Vega family receives none. |
| M4 | A second Vega invitation captured after memory seeding yields a structured summary that mentions the remembered ground-floor preference; the host panel lists it and Forget removes it. |
| M5 | The recorded video is under 5 minutes and shows each beat on the live URL. |

## 10. Risks

| Risk | Mitigation |
| --- | --- |
| AWS profile not restored on the laptop | Phase 0 cannot start; every AWS command uses `--profile archy`. |
| `layalga_agent` password unavailable on this machine | Reset it with the administrative connection per `docs/release/runtime-database-and-identity.md:16-22`; rotate the Vercel value only if the web role is also reset. |
| AgentCore cold start makes probe 4 flaky | Probe 4 window raised to 90 s with a re-drain every 15 s. |
| DKIM not verified in time | Verified address `juan294@gmail.com` as sender; domain sender switched on when verified. |
| Memory extraction latency breaks the live demo | `scripts/seed-memory.ts` writes the demo party's events before recording; recall is shown, not write-then-read. |
| Span content carries names | Guests are synthetic; log group retention 14 days; documented in `docs/security/data-lifecycle.md`. |
| Bedrock nondeterminism fails probe 6 (four notifications) | Escalation fan-out stays model-driven with the idempotent `notify` tool; if a run misses a host twice, Phase 0 adds a deterministic fan-out in `runAgentTask` for `tick` escalations. |

## 11. Out of scope

WhatsApp, Twilio, Telegram, guest email, remote MCP server, direct calendar writes, Strands Graph or Swarm, rewriting the policy hook onto Interventions.
