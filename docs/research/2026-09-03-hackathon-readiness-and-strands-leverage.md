# Research: Hackathon readiness and Strands / AgentCore surface coverage

Date: 2026-09-03
Question: What has L’Ayalga implemented so far (agent runtime, Strands SDK usage, AgentCore, tools, safety hooks, demo, submission materials), and how does it map to the AWS Agents for Humans hackathon criteria?

Sources:

- https://agentsforhumans.devpost.com/ and https://agentsforhumans.devpost.com/rules (fetched 2026-09-03)
- `strands-agents/harness-sdk` docs tree under `site/src/content/docs/user-guide/` (read via `gh api`, 2026-09-03)
- `aws/bedrock-agentcore-sdk-typescript` `docs/MEMORY.md` and `src/` listing (2026-09-03)
- npm registry: `@strands-agents/sdk` 1.16.0 published 2026-08-31; `bedrock-agentcore` 0.4.3
- Live probes: `GET https://layalga.thecreativetoken.com/api/health`, `gh repo view juan294/layalga`, `vercel env ls production`
- Repository at `develop` `a428388` (v0.3.0 released to `main` as `b751b18`)

Evidence labels: VERIFIED = read in a source this session. INFERRED = judgment not stated in a source.

This document describes what exists. Recommendations live in the conversation that produced it, not here.

---

## 1. Hackathon requirements (VERIFIED)

| Item | Rule text or fact |
| --- | --- |
| Submission window | 2026-08-10 09:00 PT to 2026-09-14 17:00 PT. Judging 2026-09-15 to 2026-10-08. Winners 2026-10-14. |
| Mandate | "Build a new AI agent with Strands Agents that does real work for real people." Must handle tasks "end to end, not just chat about it." |
| Required tech | Strands Agents SDK. AgentCore optional: "Deploying with Amazon Bedrock AgentCore is a smart architectural choice." |
| Newness | Projects "newly created during the Submission Period"; frameworks, libraries, starter templates, and AI coding assistants allowed. |
| Functionality | "must be capable of being successfully installed and running consistently" and "must function as depicted in the video and/or expressed in the text description." |
| Judge access | Project available free "for testing, evaluation and use by the Sponsor, Administrator and Judges until the Judging Period ends." Credentials required for private sites. "Judges are not required to test the Project." |
| Repo | Public GitHub/GitLab/Bitbucket, MIT or Apache license visible in About, README, architecture diagram. |
| Video | Max 5 minutes, public on YouTube or Vimeo, shows working project, pitch covers problem, audience, significance. |
| Identity | AWS Builder ID required. |
| Optional | Live demo link "strengthens the Technical Implementation score." |
| Bonus | builder.aws.com posts published before the deadline, 0.2 each, max 3, up to +0.6. |
| Stage one | Pass/fail viability: fits the theme and applies required tools appropriately. |
| Stage two | Five equally weighted 5-point criteria: Technical Implementation ("How thoroughly and skillfully does the project use Strands Agents? ... A live demo and/or AWS AgentCore deployment will strengthen this score."), Design ("complete, coherent product experience — not just a technical proof of concept"), Potential Impact, Creativity & Originality ("creative, non-obvious use of Strands Agents"), Presentation. |
| Everyday track | "busywork out of daily life, home, money, health, errands, family"; ideal agents "run quietly in the background and only ping you when there's a real decision to make." |
| Prizes | $40,000 total; Grand $10,000; each track Gold $5,000, Silver $3,000, Bronze $2,000. One prize per project. |

---

## 2. Submission checklist status

| Requirement | Status | Evidence |
| --- | --- | --- |
| Public repo | Done | `gh repo view`: `visibility: PUBLIC`, `license: MIT License`, homepage `https://layalga.thecreativetoken.com` |
| License in About | Done | GitHub `licenseInfo.name = "MIT License"`; `LICENSE:1-3` |
| README | Done | `README.md:1-162`, includes four-beat demo, architecture image, Strands hook excerpt, cc-rpi disclosure |
| Architecture diagram | Done | `docs/architecture/layalga-architecture.{mmd,svg,png,drawio}`; nodes and edges at `layalga-architecture.mmd:2-53` |
| Live demo link | Live | `GET /api/health` returned `{"status":"ok","commit":"b751b18...","configuration":{"ready":true,"issues":[]}}`; `/` redirects 307 to `/en`, which returns 200 |
| Judge access | Demo host sign-in | `DEMO_MODE` renders demo-host buttons on `/[locale]/sign-in` (`src/app/[locale]/sign-in/page.tsx:28`); production `DEMO_MODE="true"` (Vercel env, 2026-09-03) |
| Demo video | Not recorded | Only `docs/submission/video-script.md` (4:55 script). No video file in the repo. `docs/submission/devpost.md:15` holds `[ADD AFTER AUTHORIZED UPLOAD]`. `phase-6.md:16` task 6.4 unchecked. |
| Devpost entry | Not filed | `devpost.md:17`: "Do not file this entry until the live URL and video URL pass the release playbook." No Devpost URL recorded anywhere. |
| AWS Builder ID | Not recorded | `docs/plans/2026-08-29-layalga-hackathon-build.md:444,450-451`; `docs/research/2026-08-29-layalga-brief.md:88-90` describe it as an owner action. |
| builder.aws posts | Three drafts, unpublished | `docs/submission/posts/*.md:3` each reads "Status: Draft. Publication needs separate authorization." |
| Text description | Drafted | `docs/submission/devpost.md:1-115` (Inspiration, What it does, How we built it, Challenges, Accomplishments, Learned, Next, Built with, Eligibility disclosure). No testing-instructions section. |
| Newness disclosure | Present | `devpost.md:113-115`; repository root commit `7a3c6bf` "chore: bootstrap L'Ayalga with cc-rpi" dated 2026-08-29. |

### 2.1 Documentation statements versus live state

- `docs/release/e2e-pro-playbook.md:5` and `:145-147` state "no candidate deployment has been verified" and "BLOCKED before publication." The live health endpoint reports commit `b751b18`, which is `main` at `release: v0.3.0` (`git log origin/main -1`). `gh release list` shows v0.3.0 (2026-09-01), v0.2.0, v0.1.1. (VERIFIED both; the playbook text predates the releases. INFERRED.)
- `README.md:22` states "Strands uses Amazon Bedrock Sonnet 4.5 for real model runs; tests and the deterministic demo driver use a scripted model." Production Vercel environment values on 2026-09-03: `AGENT_RUNTIME="local"`, `MODEL="scripted"`, `SCHEDULER="none"`, `DEMO_MODE="true"`, `BEDROCK_MODEL_ID="us.anthropic.claude-sonnet-4-5-20250929-v1:0"`, `AWS_REGION="us-east-1"`; `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` are set. The live deployment therefore runs `TaskScriptedModel` (`src/agent/scripted-model-selection.ts:16-180`), which branches `host_capture` on a `/vega/i` regex (`:65-84`) and does not call Bedrock.
- `docs/release/e2e-pro-playbook.md:32` row "Other vendors": "Strands scripted locally; real Bedrock use remains unverified." ADR 0002 addendum `docs/decisions/0002-agent-runtime.md:148,157` records a successful direct Bedrock `Converse` and a completed AgentCore Sonnet 4.5 run on 2026-08-31.

---

## 3. What is implemented

### 3.1 Strands SDK usage (`@strands-agents/sdk` 1.15.0, `package.json:37`)

Single construction site `buildAgent` (`src/agent/agent.ts:26-49`): `new Agent({ model, tools, sessionManager, systemPrompt, printer: false, toolExecutor: "sequential" })`.

| SDK surface | Used | Where |
| --- | --- | --- |
| `Agent`, `agent.invoke` with `invocationState` and `cancelSignal` (240 s) | Yes | `src/agent/agent.ts:26-49`, `src/agent/run-task.ts:218-224` |
| `tool()` with Zod schemas | Yes, 10 tools | `src/agent/tools/*.ts:1` |
| `BedrockModel` | Yes, wrapped by `PromptMinimizingModel` | `src/agent/agent.ts:51-62`, `src/agent/prompt-minimization.ts:21-53` |
| Custom `Model` subclass | Yes, `ScriptedModel` / `TaskScriptedModel` | `src/agent/scripted-model.ts:18-89`, `src/agent/scripted-model-selection.ts:16-180` |
| `SessionManager` over custom `Storage` | Yes, `PostgresStorage` namespaced `session`, `saveLatestOn: "message"` | `src/agent/agent.ts:36-42`, `src/agent/storage/postgres-storage.ts:23-87` |
| Hooks: `agent.addHook(BeforeToolCallEvent, ...)` | Yes, one handler | `src/agent/policy-hook.ts:37-128` |
| Interrupts: `event.interrupt`, `InterruptResponseContent` | Yes | `src/agent/policy-hook.ts:82-94`, `src/agent/run-task.ts:209-212` |
| `toolExecutor: "sequential"` | Yes | `src/agent/agent.ts:46` |
| Bilingual system prompts | Yes | `src/agent/system-prompt.ts:1-4` |
| Interventions (`InterventionHandler`, `HumanInTheLoop`, `SteeringHandler`, `LLMSteeringHandler`, `CedarAuthorization`) | No | repo-wide grep: no import |
| `MemoryManager` / memory stores / AgentCore Memory store | No | none |
| `structuredOutputSchema` | No | none |
| `Graph`, `Swarm`, agents-as-tools, `A2AAgent` | No | none |
| `McpClient` | No | none (the app registers WebMCP tools in the browser instead, section 3.5) |
| Plugins (`GoalLoop`, `AgentSkills`, `ContextInjector`, `ContextOffloader`, `contextManager`) | No | none |
| `ModelRouter` | No | none |
| `agent.stream()` / streaming events to UI | No | UI polls run rows (`src/components/runs/run-status-poller.tsx:88-92`) |
| OpenTelemetry traces / `AgentResult.metrics` export | No | no `opentelemetry` dependency (`package.json:30-63`) |
| Bedrock guardrails config | No | none |
| Retry strategy configuration | No | SDK defaults |

Task-conditional tool sets (`src/agent/deps.ts:20-37`): `host_room_request` gets `list_guest_rooms`, `find_room_options`, `prepare_room_action`; other tasks get `capture_invitation`, `find_visit_options`, `evaluate_overlap`, `create_temporary_hold`, `confirm_visit`, `reschedule_visit`, `notify`.

Task schema, a Zod discriminated union of seven tasks (`src/agent/task.ts:22-83`): `host_capture`, `host_room_request`, `guest_submit`, `guest_change`, `guest_reconfirm`, `resume`, `tick`.

### 3.2 Safety and policy

- Gated tools `create_temporary_hold`, `confirm_visit`, `reschedule_visit` (`src/agent/policy-hook.ts:22-26`).
- Input sanitization strips model-authored `approvedBy`, `roomIds`, `overflowConsent` and rebuilds the draft from trusted guest submission or database state (`src/agent/tools/shared.ts:77-196`).
- Two deterministic evaluations per gated call: `evaluateRoomSelection` and `evaluateOverlap`; strictest outcome wins; every verdict audited as `policy_verdict` (`src/agent/policy-hook.ts:44-68`).
- Interrupt raised as `host_decision` with a verified reason payload and `stayApprovalHash` (`src/agent/policy-hook.ts:82-94`, `src/agent/host-decision-context.ts:21-48`).
- Post-approval re-verification against fresh state before injecting `approvedBy` (`src/agent/policy-hook.ts:95-126`).
- Interrupt persistence in `public.pending_decisions` with `unique (agent_session_id, interrupt_id)` (`src/agent/run-task.ts:226-259`, `supabase/migrations/20260831000200_agent.sql:14-30`); resume verifies the host decision row, claims it with `applied_run_id`, and writes `decision_applied` exactly once (`src/agent/run-task.ts:156-199`, `:261-289`).
- Prompt minimization removes host and party names before provider calls (`src/agent/prompt-minimization.ts:11-19`).
- Bounded inputs (`src/agent/task-limits.ts:1-12`) and bounded room output (`src/agent/tools/room-output.ts:6-19`).

### 3.3 Durable runs and scheduling

- Queue with idempotency keys, bounded attempts, leases; `after()` opportunistic dispatch; per-minute Vercel Cron `/api/ticks` recovers leases, drains two runs, claims due jobs (`vercel.json:3-12`, `src/app/api/ticks/route.ts:12-28`, `src/agent/runtime/local.ts:26-47`).
- Reconfirmation state machine: chase at 09:00 local three days before arrival, escalation after 24 h (`src/core/reconfirmation/state-machine.ts:3,35-110`); jobs retry at 1 and 5 minutes and quarantine on the third failure (`src/core/reconfirmation/jobs.ts:186-255,446`).
- Injectable clock: `DbDemoClock` active only for `demo` homes with an enabled row (`src/core/clock.ts:52-96`); `POST /api/demo/clock` (`src/app/api/demo/clock/route.ts:18-96`).
- EventBridge Scheduler adapter exists, targets `arn:aws:scheduler:::aws-sdk:bedrockagentcore:invokeAgentRuntime` (`src/agent/scheduler/index.ts:56-77,115-133`); IAM policy placeholders unrendered (`infra/iam/scheduler-invoke-policy.json:8,14`); `scripts/infra-scheduler.sh:9-12` short-circuits on the ADR's local verdict. No schedule was created against a live runtime.

### 3.4 AgentCore

| Service | Status | Evidence |
| --- | --- | --- |
| Runtime | Code complete; two runtimes deployed and both deleted | `src/agent/runtime/agentcore.ts:21-98` (`BedrockAgentCoreApp`, `addAsyncTask`/`completeAsyncTask`), `src/agent/client.ts:46-129` (`InvokeAgentRuntimeCommand`, `execute_run` envelope); `docs/decisions/0002-agent-runtime.md:121` (`layalga_agent-h3IZEMHONS`, deleted), `:157` (`layalga_agent-mONXXjFms4` version 7, completed run `07397d2b-...`, invitation created, `tool_call` audit, session saved as `layalga_agent` role); `scripts/build-agent-bundle.sh:23-104` |
| Selected runtime | `AGENT_RUNTIME=local` in production | ADR `:159`; Vercel env 2026-09-03 |
| Memory | Not used | Strands `SessionManager` over Postgres instead (`src/agent/agent.ts:36-42`) |
| Gateway | Not used | in-process `tool()` definitions |
| Identity | Not used; explicitly denied for web role | `infra/iam/web-bedrock-policy.json:18-23` |
| Browser, Code Interpreter | Not used | none |
| Observability | Runtime context logger only | `src/agent/runtime/agentcore.ts:24-30,71-77`; IAM grants X-Ray and CloudWatch metrics unused by code (`infra/iam/agentcore-runtime-execution.json:33-45`) |
| Policy (Cedar), Evaluations, Harness | Not used | none |

Unused pinned dependencies: `@aws-sdk/client-bedrock-agentcore-control`, `@aws-sdk/client-bedrock-runtime`, `@aws-sdk/client-s3`, `fastify` (`package.json:32-40`; no source import).

### 3.5 Product surface

- Pages: host dashboard `/[locale]` (room ledger, visit calendar, pending decisions, capture form, demo clock, activity feed; `src/app/[locale]/(host)/page.tsx:256-517`), `/[locale]/sign-in`, guest link `/[locale]/g/[token]`, `/[locale]/visits`, `/[locale]/runs/[id]/status`. API: `/api/agent/run`, `/api/ticks`, `/api/runs/[id]`, `/api/health`, `/api/demo/clock`, `/api/demo/reset`, `/auth/*`, `/calendar/[token]` (ICS, pull-only, ETag/304; `src/app/calendar/[token]/route.ts:15-35`).
- Locales `en` and `es` via `next-intl` (`src/i18n/routing.ts:3-6`).
- WebMCP: six page-registered tools, three host (`layalga.host.read_rooms`, `prepare_private_block`, `prepare_room_control`; `src/components/webmcp/host-tools.ts:50-122`) and three guest (`layalga.guest.read_room_options`, `prepare_search`, `prepare_booking`; `src/components/webmcp/guest-tools.ts:47-125`). Every prepare tool returns `submitted: false`; none writes to the database.
- Rooms: authoritative inventory, withheld/open/close overrides, private blocks, overflow capacity, DP recommendation, exact selection, GiST exclusion constraint (`src/core/rooms/availability.ts:87-166`, `recommendation.ts:31-88`, `occupancy.ts:12-83`).
- Notifications: in-app only. The `notify` tool is the sole insert site (`src/agent/tools/notify.ts:71-82`). No email, SMS, push, or chat SDK in `package.json`; every `fetch` is same-origin. The ICS feed is the single outward surface.
- Auth: Supabase Google OAuth for hosts, optional guest claim, signed synthetic demo sessions (`src/lib/auth/demo-session.ts:18-95`, `src/lib/auth/current-host.ts:30-46`).
- Observability: ten bracketed `console.error` codes and `/api/health` (`src/app/api/health/route.ts:33-130`); no OTEL, Sentry, or analytics.

### 3.6 Verification assets

- 18 test files under `src/agent` (`src/agent/**/*.test.ts`), including cross-process interrupt resume (`src/agent/interrupt-resume.test.ts:43`), nine tenant-authority cases (`src/agent/tenant-scope.test.ts`), queue claims and leases (`src/agent/queue.test.ts`), and AgentCore boundary parsing (`src/agent/runtime/request.test.ts`).
- Five Playwright journeys and the 719-line demo driver (`scripts/demo-e2e.ts:21-43`), nine release probes (`scripts/release-probes.ts:86-182`).
- CI: `ci.yml`, `codeql.yml`, `dependency-review.yml` (`.github/workflows/`), running with `MODEL: scripted` (`ci.yml:75-86`).

---

## 4. Strands and AgentCore features available in TypeScript and not used (VERIFIED from docs, 2026-09-03)

| Feature | Import | Notes |
| --- | --- | --- |
| Interventions | `InterventionHandler`, `InterventionActions` from `@strands-agents/sdk` | `proceed/deny/guide/confirm/transform`; `onError: 'deny'` fail-closed; `confirm` only on `beforeToolCall` |
| Human in the Loop | `@strands-agents/sdk/vended-interventions/hitl` | `allowedTools`, `classifier`, `enableTrust`, interrupt/resume default |
| Steering | `@strands-agents/sdk/vended-interventions/steering` | `SteeringHandler`, `LLMSteeringHandler`, `ToolLedgerProvider`; TypeScript-preferred surface |
| Cedar authorization | `@strands-agents/sdk/vended-interventions/cedar` | default-deny, `principalResolver`, `contextEnricher`, `call_count` rate limits, schema validation from `tools`, TS-only `namespace` |
| Memory | `MemoryManager` + `AgentCoreMemoryStore` from `bedrock-agentcore/memory/strands` | recall via `search_memory` tool, injection, server-side extraction; namespaces per actor |
| Structured output | `structuredOutputSchema` (Zod), `StructuredOutputError` | retries on `.refine()` messages |
| Multi-agent | `Graph`, `Swarm`, agents in `tools`, `.asTool()`, `A2AAgent` | constructor-based Graph in TS |
| Streaming | `agent.stream()` | event-based |
| Plugins | `GoalLoop`, `AgentSkills`, `ContextInjector`, `ContextOffloader`, `contextManager: "auto"` | TS uses `getTools()` + `initAgent()` |
| Model routing | `ModelRouter`, `FallbackStrategy`, `ClassifierStrategy` | router passed as the agent's model |
| Observability | OTEL traces with `gen_ai.*` attributes; `AgentResult.metrics` | AgentCore Observability consumes OTEL |
| Bedrock guardrails | model config on `BedrockModel` | TS reference on the Bedrock provider page |
| AgentCore Identity, Browser, Code Interpreter | `bedrock-agentcore/{identity,tools/*}` | present in the TS SDK |
| Python-only | Evals SDK, community tools package, `workflow` tool, Web Fetch, `config_to_agent` | no TS equivalents |
| AgentCore TS SDK gaps | Gateway, Observability primitives | no `src/gateway` or `src/observability` directory |

SDK versions: repository pins `@strands-agents/sdk` 1.15.0 (`package.json:37`, README badge `README.md:7`); 1.16.0 published 2026-08-31.

---

## 5. Criterion map (what exists; INFERRED mapping)

| Criterion | Existing evidence | Absent or unverified |
| --- | --- | --- |
| Technical Implementation | 10 typed tools, hook interrupt with cross-process resume, Postgres `Storage`, custom `Model`, prompt-minimizing decorator, durable queue, AgentCore Runtime package and proven run, 18 agent test files | Live site runs `MODEL=scripted`; no live AgentCore runtime; no OTEL; no interventions, memory, structured output, streaming, multi-agent |
| Design | Bilingual host and guest journeys, room ledger, calendar ledger, pending decisions UI, run status poller, ICS feed, WebMCP progressive enhancement, security headers and CSP | No outbound notification channel; hosts must open the app to see a pending decision |
| Potential Impact | Lived two-host problem, generalized to any multi-host home (`docs/research/...assessment.md:97-104`); deterministic beds/children/pets rules | — |
| Creativity & Originality | Partial overlap as first-class, interrupt only for social exceptions, controllable clock, WebMCP prepare-only tools, revocable privacy-preserving feed | — |
| Presentation | Script (`docs/submission/video-script.md`), architecture SVG, README four-beat narrative | Video not recorded; Devpost not filed |
| Bonus | Three drafts (`docs/submission/posts/`) | Not published |

---

## 6. Open items recorded in the repository

- `phase-5.md:21` task 5.6 production deploy and probes against the live hostname (unchecked; the site is live at v0.3.0 per health probe).
- `phase-6.md:16` task 6.4 recording (unchecked).
- `phase-6.md:19` task 6.7 final release per playbook (unchecked).
- ADR 0002 `:159`: runtime switch requires "the full interrupt-and-resume cloud sequence passes and the owner separately authorizes the runtime switch and release."
- Deferred follow-ons (`docs/plans/2026-08-31-agent-first-room-coordination.md:172-177`): Telegram or chat channel, remote MCP server with OAuth, direct Google/iCloud calendar writes, room photographs.
- Devpost "What is next" (`docs/submission/devpost.md:89-96`): verify Google sign-in on production, run interrupt/resume on AgentCore, add notification channels after consent contracts, host-tunable house rules, per-night room packing, plain-language audit view.
