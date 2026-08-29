# Plan: L'Ayalga hackathon build

Date: 2026-08-29. Source brief: `docs/research/2026-08-29-layalga-brief.md`.
Assessment: `docs/research/2026-08-29-agents-for-humans-hackathon-assessment.md`.
Phase files: `docs/plans/2026-08-29-layalga-hackathon-build-phases/phase-N.md`.

Evidence labels: VERIFIED = read or executed on 2026-08-29 in the planning
session, source named. DECIDED = owner decision (brief, bootstrap context, or
the three planning answers on 2026-08-29). INFERRED = judgment.

## 1. Acceptance criterion

The plan is complete when the four-beat demo runs end to end against the
deployed product and is recorded in under five minutes:

1. Host A pastes an informal invitation; the agent structures it and produces
   a guest link.
2. The guest opens the link, picks dates, a hold is placed and confirmed.
3. Host B independently invites a second family with partial overlap; the
   three rules pass; one social exception raises a Strands interrupt; a host
   approves it in the host view and the run resumes.
4. The labeled demo clock warps to T-3; the guest does not answer; at T-3 plus
   24 hours the agent escalates to both hosts per policy.

Plus the five automated targets in section 13 and the submission package in
section 15.

## 2. Evidence basis

| Fact | Status | Source |
|---|---|---|
| `@strands-agents/sdk` 1.15.0 (2026-08-27), ESM only, Node >= 20, `zod ^4.1.12` peer | VERIFIED | `npm view`, unpacked tarball `dist/src/*.d.ts` |
| `BeforeToolCallEvent` implements `Interruptible`; `event.interrupt<T>({name, reason})` halts with `stopReason: 'interrupt'`; `event.cancel = string` blocks the tool with that error | VERIFIED | `dist/src/hooks/events.d.ts`, `dist/src/interrupt.d.ts` |
| Interrupt state including `pendingToolExecution` is part of session snapshots; resume is `agent.invoke(InterruptResponseContent[])` on a fresh `Agent` with the same `SessionManager`, no model re-call | VERIFIED | `dist/src/interrupt.d.ts`, `dist/src/types/agent.d.ts`, docs `session-manager.ts` |
| `SessionManager({ sessionId, storage })` accepts any `Storage` with `write/read/delete/list` over `Uint8Array`; restore happens automatically on agent construction | VERIFIED | `dist/src/session/session-manager.d.ts`, `dist/src/storage/storage.d.ts` |
| `BedrockModel({ region, modelId })` passes `us.anthropic.*` inference-profile ids through unvalidated | VERIFIED | runtime probe by research agent, `models/bedrock.js` |
| Custom `Model` subclass needs only `stream()`, `getConfig()`, `updateConfig()` | VERIFIED | `dist/src/models/model.d.ts` |
| `bedrock-agentcore` 0.4.3 ships `BedrockAgentCoreApp` (Fastify, `/invocations`, `/ping`, `HealthyBusy`, `addAsyncTask`) and `bedrock-agentcore/memory/strands` | VERIFIED | unpacked tarball by research agent |
| AgentCore Runtime direct code deploy: `codeConfiguration` with `runtime: NODE_22`, S3 zip, `entryPoint: ["app.js"]`, no Docker or ECR | VERIFIED | `aws bedrock-agentcore-control create-agent-runtime help`, AWS devguide `runtime-get-started-code-deploy-node` |
| Runtime sessions are ephemeral: 15 min idle default, 8 h max, microVM wiped on stop; `runtimeSessionId` >= 33 chars | VERIFIED | AWS devguide `runtime-sessions` |
| EventBridge Scheduler universal target `arn:aws:scheduler:::aws-sdk:bedrockagentcore:invokeAgentRuntime`, `at()` one-shot, `--action-after-completion DELETE`; synchronous with an observed, undocumented ~30 s timeout | VERIFIED (target, CLI) / VERIFIED-as-reported (timeout) | Scheduler user guide, `deeheber/job-search-agent` CDK, danielleheberling.xyz DLQ follow-up |
| AgentCore log group `/aws/bedrock-agentcore/runtimes/{id}-DEFAULT`; pricing $0.0895 per vCPU-hour, $0.00945 per GB-hour | VERIFIED | AWS devguide, pricing page |
| Next 16.3.3: `proxy.ts` replaces `middleware.ts`, Turbopack default, `next lint` removed, async `params` mandatory | VERIFIED | nextjs.org upgrade guide v16 |
| TypeScript must be 6.0.3: `typescript-eslint@8.68.0` peer `typescript >=4.8.4 <6.1.0`; ESLint 9.39.5 (`maintenance`) | VERIFIED | `npm view` |
| next-intl 4.14.1 supports Next 16, uses `next/root-params` (default in 16.3+) | VERIFIED | next-intl docs, `npm view` |
| drizzle-kit cannot express `EXCLUDE` or `daterange` (issue #3388 open 2026-05-06); drizzle-orm has `.for('update', { skipLocked })` | VERIFIED | GitHub API, unpacked `drizzle-orm@0.45.2` |
| Vercel team `thecreativetoken` is Pro: per-minute Cron, 300 s default and 800 s max function duration | VERIFIED | `vercel teams ls`, Vercel API `/v2/teams`, Vercel docs |
| Supabase project `layalga`, ref `hyyrnpyidipkuhakeiyb`, us-east-1, Postgres 17, `ACTIVE_HEALTHY`; DB password and publishable key in gitignored `.env.local` | VERIFIED | `supabase projects create` and `projects list` on 2026-08-29 |
| Local toolchain: Node 24.18.0, pnpm 11.22.0, Supabase CLI 2.116.0, Docker daemon up, Vercel CLI 50.23.2, AWS CLI 2.36.34, `archy` identity `arn:aws:iam::106403001709:user/archy` | VERIFIED | version commands, `aws sts get-caller-identity` |
| Bedrock entitlement: Sonnet 4.5 and Haiku 4.5 inference profiles respond; Claude 5 denied | VERIFIED (bootstrap session) | brief, Constraints |

## 3. Decisions recorded by this plan

Owner answers on 2026-08-29 (DECIDED):

- D1. Escalation window is 24 hours after the T-3 chase.
- D2. The Google OAuth client is created in Phase 3 by browser automation on
  the owner's Google Cloud project and wired into Supabase Auth. The recorded
  demo never depends on it.
- D3. Creating, updating, and deleting AWS resources named `layalga-*` in
  account 106403001709, region us-east-1, under profile `archy` is
  pre-authorized for Phases 0, 4, and 5. Vercel production deploys, DNS,
  GitHub pushes to `main`, and any publication remain separate gates.

Planning decisions (INFERRED, within the brief's boundaries):

- D4. Single package, no monorepo. Vercel root directory stays `.`. The
  AgentCore bundle is a second build target (`esbuild`) from the same source.
- D5. Seven typed tools, not six: `capture_invitation`, `find_visit_options`,
  `evaluate_overlap`, `create_temporary_hold`, `confirm_visit`,
  `reschedule_visit`, `notify`. `schedule_reconfirmation` from the brief is
  folded into `confirm_visit` and `reschedule_visit` because scheduling the
  reconfirmation must never be the model's choice. `reschedule_visit` is
  required by success criterion 4. `notify` writes in-app notifications
  (no external delivery).
- D6. The policy hook is authoritative. A `BeforeToolCallEvent` hook runs
  `evaluateOverlap` before `create_temporary_hold`, `confirm_visit`, and
  `reschedule_visit`: `deny` cancels the tool with the rule as the error
  message, `interrupt` raises a Strands interrupt named `host_decision`. The
  `evaluate_overlap` tool is read-only and exists so the agent can explain
  outcomes; it never gates anything.
- D7. Host approval persists as a Strands session snapshot in Postgres
  (`agent_sessions`) plus a `pending_decisions` row. The AgentCore fallback
  in the brief (`pending_decision` row plus resume) is therefore built on both
  paths; the only thing Phase 0 decides is where the agent process runs.
- D8. The agent runs behind one interface, `runAgentTask(payload)`. Two
  hosts: the AgentCore entrypoint (`src/agent/runtime/agentcore.ts`) and a
  Next.js route handler (`src/app/api/agent/run/route.ts`,
  `maxDuration = 300`). `AGENT_RUNTIME=agentcore|local` selects the client.
  `local` is also the mode for development and Playwright.
- D9. `scheduled_jobs` in Postgres is authoritative for what is due.
  EventBridge Scheduler is the real-time trigger (`SCHEDULER=eventbridge`).
  The demo clock runs the same tick handler against warped time
  (`SCHEDULER=none` for the demo home). Fallback trigger if AgentCore fails:
  Vercel Cron every minute hitting `/api/ticks` (Pro plan verified).
- D10. Supabase SQL migrations are the single schema source of truth.
  drizzle-orm is a typed query builder only; drizzle-kit is not installed.
  The overlap guard is `EXCLUDE USING gist (room_id WITH =, stay WITH &&)`
  with `btree_gist`.
- D11. TypeScript 6.0.3, ESLint 9.39.5, zod 4.5.2, exact pins in section 6.
- D12. Model id is configuration: `BEDROCK_MODEL_ID` defaults to
  `us.anthropic.claude-sonnet-4-5-20250929-v1:0`.
- D13. Phase 0 lives in `spike/agentcore/` with its own `package.json` so the
  root has no `package.json` until Phase 1 and the Vercel ignore-build step
  keeps skipping deploys. Phase 1 moves the runtime adapter into `src/agent/`
  and deletes `spike/`.
- D14. Tests that need the agent loop use a `ScriptedModel extends Model`
  that yields a fixed tool-use sequence. Bedrock is used by the demo and by
  one end-to-end script, not by unit or integration tests.
- D15. The room allocation is per stay, not per night: a room taken by any
  overlapping visit is unavailable for the whole draft stay. Documented
  simplification; the demo seed never needs per-night packing.
- D16. Any special request outside the three rules raises an interrupt,
  whether or not the stay overlaps another party. `deny` takes precedence
  over `interrupt` (no point asking about a stay that cannot fit).
- D17. Tables are not exposed through PostgREST; the server uses the
  service connection. RLS is enabled with no policies on every table. The
  cc-rpi rule requiring `anon`/`authenticated` grants applies to
  public-facing tables only; none exist.

## 4. Architecture

```
Host A / Host B                      Guest (link token, optional Google)
      |                                        |
      v                                        v
Next.js 16 on Vercel (src/app) -- host view, guest link, /api/*, proxy.ts (i18n + auth)
      |            ^                         |
      | AgentClient|runs, pending_decisions  | ticks (fallback: Vercel Cron)
      v            |                         v
  AGENT_RUNTIME=agentcore ------------> AgentCore Runtime (NODE_22 zip, BedrockAgentCoreApp)
  AGENT_RUNTIME=local --> /api/agent/run   |  runAgentTask(payload)
                                           |  Strands Agent + 7 tools + policy hook
                                           |  SessionManager(PostgresStorage)
                                           v
                              Supabase Postgres (authoritative)
                homes, rooms, hosts, parties, invitations, visits, visit_rooms,
                pending_decisions, agent_sessions, scheduled_jobs, notifications,
                runs, audit_events, demo_clock
                                           ^
EventBridge Scheduler (at(), DELETE) ------+-- invokeAgentRuntime {task:'tick', jobId}
Bedrock: us.anthropic.claude-sonnet-4-5-20250929-v1:0 (converse via Strands BedrockModel)
```

Interrupt flow (the product's core loop):

1. Web inserts a `runs` row and calls `AgentClient.run(payload)`.
2. `runAgentTask` builds `new Agent({ model, tools, sessionManager: new SessionManager({ sessionId, storage: new PostgresStorage(db) }) })`. Construction restores any prior snapshot for that `sessionId`.
3. The model calls `create_temporary_hold`. The policy hook runs `evaluateOverlap` from the database. On `interrupt` it calls `event.interrupt({ name: 'host_decision', reason })`. The agent stops with `stopReason: 'interrupt'`; the SessionManager saves the snapshot (`saveLatestOn: 'message'`, verified in Phase 0 to include the interrupt).
4. `runAgentTask` writes one `pending_decisions` row per unanswered interrupt and returns `{ status: 'interrupted' }`.
5. A host approves in the host view. The server action updates `pending_decisions`, then calls `AgentClient.run({ task: 'resume', sessionId, responses })`.
6. A new process (new microVM on AgentCore, new function on Vercel) constructs the agent, restores the snapshot including `pendingToolExecution`, and `invoke(responses)` continues: the hook returns the response, the tool executes, the run completes. No model call is repeated.

Tick flow: Scheduler invokes the runtime with `{ task: 'tick', jobId }`. The entrypoint validates, registers an async task (`HealthyBusy`), returns `{ status: 'accepted' }` within milliseconds, then runs the deterministic reconfirmation state machine; the agent is invoked only to compose and send the bilingual chase or escalation through `notify`.

## 5. Repository layout

```
package.json, pnpm-lock.yaml, tsconfig.json, next.config.ts, eslint.config.mjs,
vitest.config.ts, playwright.config.ts, vercel.json, .env.example
src/
  core/            pure TypeScript, no framework or SDK imports
    clock.ts       Clock interface, SystemClock, DbDemoClock
    policy/        evaluate-overlap.ts, allocate-rooms.ts
    booking/       holds.ts (transactions, FOR UPDATE), visits.ts, invitations.ts
    reconfirmation/ state-machine.ts, jobs.ts
    db/            schema.ts (drizzle tables mirroring SQL), client.ts
    i18n/          message catalogs for agent-facing strings if any
  agent/
    agent.ts       buildAgent({ sessionId, deps })
    tools/         seven tool modules
    policy-hook.ts BeforeToolCallEvent hook
    storage/       postgres-storage.ts (Strands Storage)
    run-task.ts    runAgentTask(payload) -> RunResult
    runtime/
      agentcore.ts BedrockAgentCoreApp entrypoint (bundled by esbuild)
      local.ts     in-process invoker
    client.ts      AgentClient (agentcore | local)
    scripted-model.ts (test support)
  app/             Next.js App Router
    [locale]/(host)/...  host view: calendar, pending decisions, activity
    [locale]/g/[token]/  guest link page
    auth/callback/route.ts
    api/agent/run/route.ts, api/ticks/route.ts, api/demo/clock/route.ts,
    api/demo/reset/route.ts, api/health/route.ts
  i18n/            routing.ts, navigation.ts, request.ts
  proxy.ts
messages/en.json, messages/es.json
supabase/config.toml, supabase/migrations/*.sql, supabase/seed.sql
scripts/           build-agent-bundle.sh, deploy-agentcore.sh, demo-e2e.ts,
                   seed-demo.ts, verify-bootstrap.sh
infra/             iam/*.json policies, scheduler/README.md
tests/             e2e (Playwright), fixtures
docs/architecture/ diagram source and PNG
```

## 6. Pinned versions

```
next 16.3.3 · react 19.2.8 · react-dom 19.2.8 · typescript 6.0.3
@types/react 19.2.18 · @types/react-dom 19.2.5 · @types/node 24.x latest
next-intl 4.14.1 · @supabase/supabase-js 2.112.4 · @supabase/ssr 0.12.5
drizzle-orm 0.45.2 · postgres 3.4.9 · zod 4.5.2
@strands-agents/sdk 1.15.0 · bedrock-agentcore 0.4.3 · fastify (peer of bedrock-agentcore, its declared range)
@aws-sdk/client-bedrock-runtime 3.1121.0 · @aws-sdk/client-bedrock-agentcore 3.1121.0
@aws-sdk/client-bedrock-agentcore-control 3.1121.0 · @aws-sdk/client-scheduler 3.1121.0
vitest 4.1.11 · @vitest/coverage-v8 4.1.11 · @playwright/test 1.62.1
eslint 9.39.5 · eslint-config-next 16.3.3 · eslint-config-prettier latest · prettier 3.9.6
esbuild 0.25.x latest · tsx latest
engines.node "24.x" (Vercel) — the AgentCore bundle targets node22 and the
package declares `engines.node ">=22"` in the bundle's own package.json
```

Phase 1 runs `pnpm add` with these exact versions and records the resolved
lockfile. Any drift from this table is a plan deviation.

## 7. Data model

All tables in `public`, created by numbered SQL migrations under
`supabase/migrations/`. `id` is `uuid default gen_random_uuid()`. Timestamps
are `timestamptz`. RLS enabled, no policies (D17).

| Table | Key columns | Notes |
|---|---|---|
| `homes` | `name`, `timezone`, `pets_together_allowed bool`, `max_families_with_children int default 1`, `demo bool` | one row per home |
| `rooms` | `home_id`, `name`, `beds int` | |
| `hosts` | `home_id`, `display_name`, `locale text check in ('en','es')`, `auth_user_id uuid null` | two per home |
| `parties` | `home_id`, `family_name`, `locale`, `link_token text unique`, `link_token_expires_at`, `auth_user_id uuid null` | guest identity; `link_token` is a 32-byte base64url random |
| `invitations` | `home_id`, `host_id`, `party_id`, `raw_message text`, `structured jsonb`, `status text check in ('tentative','sent','converted','cancelled')` | `structured` follows `InvitationStructured` in phase-2 |
| `visits` | `home_id`, `party_id`, `invitation_id`, `stay daterange not null`, `adults int`, `children int`, `pets int`, `special_requests text[]`, `status text check in ('hold','confirmed','reconfirm_pending','reconfirmed','escalated','cancelled')`, `hold_expires_at`, `confirmed_at`, `reconfirm_requested_at`, `reconfirmed_at`, `escalated_at`, `approval_stay_hash text null` | `approval_stay_hash` records which stay a host approval applied to |
| `visit_rooms` | `visit_id`, `room_id`, `stay daterange` | `EXCLUDE USING gist (room_id WITH =, stay WITH &&)`; rows deleted on cancel |
| `pending_decisions` | `home_id`, `visit_id null`, `run_id`, `agent_session_id`, `interrupt_id`, `interrupt_name`, `reason jsonb`, `status text check in ('pending','approved','declined')`, `decided_by_host_id`, `decided_at`, `note` | one per Strands interrupt |
| `agent_sessions` | `key text primary key`, `session_id text`, `data bytea`, `updated_at` | Strands `Storage` backend; `session_id` extracted from the key for cleanup |
| `scheduled_jobs` | `home_id`, `visit_id`, `kind text check in ('reconfirm_chase','reconfirm_escalate')`, `due_at`, `status text check in ('scheduled','running','done','cancelled')`, `external_ref text` | `external_ref` is the Scheduler schedule name |
| `notifications` | `home_id`, `recipient_kind text check in ('host','party')`, `recipient_id`, `visit_id`, `kind text`, `body_en`, `body_es`, `read_at` | in-app inbox |
| `runs` | `home_id`, `session_id`, `task text`, `status text check in ('running','completed','interrupted','failed')`, `payload jsonb`, `result jsonb`, `started_at`, `finished_at` | polled by the UI |
| `audit_events` | `home_id`, `run_id`, `actor text`, `kind text`, `payload jsonb` | every tool call, decision, and policy verdict; feeds the host view activity feed |
| `demo_clock` | `home_id primary key`, `now timestamptz`, `enabled bool` | injectable clock; only read when `homes.demo = true` |

Indexes: `visits(home_id, stay)` GiST, `scheduled_jobs(status, due_at)`,
`pending_decisions(home_id, status)`, `agent_sessions(session_id)`,
`parties(link_token)`.

## 8. Agent design

System prompt (both languages, selected by the actor's locale): the agent is
the hospitality coordinator for one home with two hosts; it structures
invitations, converts flexible plans into dates, places holds, confirms
visits, and follows up before arrival; it never decides whether a host must
be asked, the policy layer does; it never reveals another party's family
name to a guest; it writes guest-facing and host-facing messages in the
recipient's language and always provides both `body_en` and `body_es` to
`notify`.

Tools (zod 4 schemas in phase-2):

| Tool | Input | Effect | Gated by hook |
|---|---|---|---|
| `capture_invitation` | `hostId`, `partyName`, `partyLocale`, `adults`, `children`, `pets`, `flexibleDates` (free text plus optional `earliest`/`latest`), `arrivalTime?`, `specialRequests[]`, `rawMessage` | inserts `parties` (or reuses by name within the home), `invitations` (tentative), generates link token, audit event; returns `invitationId`, `guestLink` | no |
| `find_visit_options` | `invitationId`, `window {from,to}`, `nights` | returns candidate stays with free beds and an anonymized overlap summary ("another party: 2 adults, 1 pet") | no |
| `evaluate_overlap` | `invitationId`, `stay`, party overrides | returns the policy verdict with reasons; read-only | no |
| `create_temporary_hold` | `invitationId`, `stay`, `adults`, `children`, `pets`, `arrivalTime?`, `specialRequests[]` | transaction: lock home row `FOR UPDATE`, allocate rooms, insert `visits` (hold, `hold_expires_at = now + 48h`) and `visit_rooms`; audit | yes |
| `confirm_visit` | `visitId` | hold to confirmed, `confirmed_at`, schedules `reconfirm_chase` at `stay.start 09:00 local - 3 days`; audit | yes (re-evaluates with current state) |
| `reschedule_visit` | `visitId`, `stay`, optional party changes | transaction: re-allocate rooms, update `visits`, clear `approval_stay_hash`, cancel and recreate reconfirmation jobs; audit | yes |
| `notify` | `recipientKind`, `recipientId`, `visitId?`, `kind`, `bodyEn`, `bodyEs` | inserts `notifications`; audit | no |

Policy hook (`src/agent/policy-hook.ts`):

```
agent.addHook(BeforeToolCallEvent, async (event) => {
  if (!GATED.has(event.toolUse.name)) return
  draft = buildDraft(event.toolUse.input, db)          // stay, party, specialRequests, visitId?
  verdict = await evaluateOverlap(draft, await loadHouseState(db, draft))
  audit('policy_verdict', verdict)
  if (verdict.decision === 'deny') { event.cancel = denyMessage(verdict); return }
  if (verdict.decision === 'interrupt') {
    if (draft.visitId && approvalCovers(draft)) return   // approval_stay_hash matches
    response = event.interrupt<HostDecision>({ name: 'host_decision', reason: verdict })
    if (!response.approved) { event.cancel = `Declined by host: ${response.note}`; return }
    event.toolUse.input.approvedBy = response.hostId      // tool records approval_stay_hash
  }
})
```

`HostDecision = { approved: boolean, hostId: string, note?: string }`.

Session storage (`src/agent/storage/postgres-storage.ts`): implements
`Storage` with `write` = upsert, `read` = select `data`, `delete`, `list` =
`WHERE key LIKE prefix || '%' ORDER BY key`. `namespace()` uses the SDK's
`resolveNamespace` helper.

Runtime payload contract (`AgentTask`, zod-validated before anything reaches
Strands; the AWS guidance about non-string prompts is the reason):

```
{ task: 'host_capture', homeId, hostId, rawMessage, locale }
{ task: 'guest_submit', homeId, invitationId, stay, adults, children, pets, arrivalTime?, notes?, locale }
{ task: 'guest_change', homeId, visitId, message, locale }
{ task: 'guest_reconfirm', homeId, visitId, answer: 'yes' | 'change', message? }
{ task: 'resume', homeId, sessionId, responses: [{ interruptId, response: HostDecision }] }
{ task: 'tick', homeId, jobId }
```

Session ids: `inv:<invitationId>` for capture, guest, and resume tasks;
`tick:<jobId>` for ticks. `RunResult = { runId, status, sessionId,
pendingDecisionIds, summary }`.

## 9. Overlap policy

`evaluateOverlap(draft, state)` in `src/core/policy/evaluate-overlap.ts`,
pure and synchronous.

- Overlapping visits: `state.visits` with status in `hold, confirmed,
  reconfirm_pending, reconfirmed, escalated`, stay ranges intersecting as
  half-open `[start, end)`, excluding `draft.visitId`.
- Rule 1, beds: `free = rooms - union(rooms of overlapping visits)`;
  `allocateRooms(free, adults + children)` picks rooms largest first until
  beds cover the party; none possible means `deny('beds')`.
- Rule 2, children: `draft.children > 0 && overlapping.some(children > 0)`
  means `deny('children')` (with `max_families_with_children = 1`).
- Rule 3, pets: `draft.pets > 0 && overlapping.some(pets > 0) &&
  !home.pets_together_allowed` means `deny('pets')`.
- Outside the rules: `draft.specialRequests.length > 0` means
  `interrupt('special_request')` carrying the allocation.
- Otherwise `allow` with the allocation.
- Precedence: deny, then interrupt, then allow.

The truth table and the test that encodes it are in phase-1.

## 10. Reconfirmation state machine

`src/core/reconfirmation/state-machine.ts`, pure, driven by `Clock`.

- On `confirm_visit`: create `reconfirm_chase` due at `stay.start at 09:00
  home timezone minus 3 days`. If that instant is already past, due `now`.
- Chase runs: `visits.status confirmed -> reconfirm_pending`,
  `reconfirm_requested_at = now`; the agent is asked to compose the chase and
  calls `notify(party)`; create `reconfirm_escalate` due `now + 24h` (D1).
- Guest answers `yes`: `reconfirmed`, `reconfirmed_at = now`, escalate job
  cancelled. Guest answers `change`: `guest_change` flow (reschedule through
  the hook).
- Escalate runs: if status is still `reconfirm_pending`, `escalated`,
  `escalated_at = now`, the agent composes and `notify`s both hosts;
  otherwise the job completes with no action.
- Reschedule: cancel open jobs for the visit and recreate the chase from the
  new stay.

## 11. Demo seed values (DECIDED here, fixed for all phases)

- Home: "Casa Ayalga", timezone `Europe/Madrid`, `pets_together_allowed =
  false`, `max_families_with_children = 1`, `demo = true`.
- Rooms: "Cuartu del Horreu" 2 beds, "Cuartu de la Fonte" 2 beds, "Cuartu
  del Teixu" 3 beds. Seven beds.
- Hosts: Host A "Nel" (locale `es`), Host B "Covadonga" (locale `en`).
- Party 1 "Familia Vega" (locale `es`): 2 adults, 2 children, 0 pets, no
  special requests. Host A's pasted message: "Oye, los Vega quieren venir a
  la casa un finde de septiembre, son Marta y Xuan con los dos crios. Les va
  mejor mediados de mes." Guest picks 2026-09-18 to 2026-09-21 (three
  nights). Allocation: Teixu (3) plus Horreu (2).
- Party 2 "The Oteros" (locale `en`): 2 adults, 0 children, 1 dog, special
  request "Ana's mother uses a wheelchair and needs ground-floor access".
  Host B's pasted message: "Hi! Inviting Ana and Pelayo Otero for the weekend
  of the 19th, they'd bring their dog Nube and possibly Ana's mother who uses
  a wheelchair." Stay 2026-09-19 to 2026-09-21. Rules: beds pass (Fonte, 2,
  the last free room), children pass, pets pass (Vega has none); the special
  request raises the interrupt to both hosts.
- Demo clock start: 2026-09-07T10:00 Europe/Madrid. Beat 4 warps: first to
  2026-09-15T09:00 (T-3 for the Vega arrival, chase fires), then to
  2026-09-16T09:05 (24 h later, escalation fires).
- Concurrency fixture (tests only): one room of 2 beds, two parties of 2
  adults racing for the same stay.

`scripts/seed-demo.ts` and `supabase/seed.sql` encode these values; the
host view shows a persistent "Synthetic demo" banner while `homes.demo` is
true.

## 12. Authentication and identity protection

- Hosts: Supabase Auth with Google (PKCE, `app/auth/callback/route.ts`
  outside the `[locale]` segment). `hosts.auth_user_id` links the account.
  Demo mode adds "Enter as Nel" and "Enter as Covadonga" buttons that set a
  signed `layalga_demo_host` cookie; the buttons render only when `DEMO_MODE`
  is true and the home is a demo home.
- Guests: `/[locale]/g/[token]` with a 32-byte random token. Optional Google
  sign-in "claims" the party (`parties.auth_user_id`). The token stays the
  primary path.
- Guest-facing surfaces never show another party's `family_name`; the
  `find_visit_options` summary and the guest page describe other parties by
  size only. Host surfaces show everything.
- `proxy.ts` composes next-intl routing with Supabase session refresh.

## 13. Success criteria

Automated (targeted, all run by `pnpm run test`; integration tests need the
local Supabase stack):

| # | Test | File | Phase |
|---|---|---|---|
| 1 | Overlap policy truth table: every combination of the three rules returns allow, deny, or interrupt as specified; any special request returns interrupt | `src/core/policy/evaluate-overlap.test.ts` | 1 |
| 2 | Holds and concurrent confirmation: two `createTemporaryHold` calls racing for the last room produce one hold and one `RoomUnavailableError` | `src/core/booking/holds.concurrency.test.ts` | 1 |
| 3 | Interrupt and resume across a process restart: a `ScriptedModel` run stops at `host_decision`; a child process resumes with the approval; the tool executed exactly once; the snapshot round-tripped through `agent_sessions` | `src/agent/interrupt-resume.test.ts` | 2 |
| 4 | Rescheduling: a reschedule of an approved special-request visit re-raises the interrupt; a reschedule that crosses the children rule is denied | `src/agent/reschedule.test.ts` | 2 |
| 5 | Clock-driven reconfirmation: `FakeClock` at T-3 chases; at T-3 plus 24 h with no answer both hosts are notified; with an answer nothing escalates | `src/core/reconfirmation/state-machine.test.ts` | 4 |

Also automated: `pnpm run typecheck`, `pnpm run lint`, `pnpm run build`,
Playwright smoke of the guest link and host view against seeded data with
`AGENT_RUNTIME=local` and `ScriptedModel` (phase-3), the Phase 0 spike
script, and the release probes in `docs/release/e2e-pro-playbook.md`.

Manual: the four-beat demo recorded in under five minutes against
`https://layalga.thecreativetoken.com` (phase-6), and the visual review of
the Paper Ink surfaces (phase-3).

## 14. Phases and schedule

Start 2026-08-29. Chapa WebMCP deadline 2026-09-03 makes 2026-09-01 to
2026-09-03 low-availability days. Submission deadline 2026-09-14 17:00 PDT
(2026-09-15 02:00 Europe/Madrid); target filing 2026-09-13.

| Phase | Title | Days | Gate |
|---|---|---|---|
| 0 | AgentCore Runtime spike, timeboxed 6 h | 08-30 | ADR 0002 records go or no-go |
| 1 | Scaffold, schema, core engine, policy | 08-30 to 08-31 | criteria 1 and 2 green, CI green |
| 2 | Agent, tools, hook, interrupt and resume | 09-01 to 09-05 (slow days inside) | criteria 3 and 4 green |
| 3 | Web: host view, guest link, i18n, auth `[batch-eligible]` | 09-06 to 09-07 | Playwright smoke green, visual review |
| 4 | Reconfirmation, clock, Scheduler `[batch-eligible]` | 09-06 to 09-07 | criterion 5 green, real schedule fired once |
| 5 | Deploy, demo hardening, end-to-end run | 09-08 to 09-09 | four beats pass on the live URL |
| 6 | Deliverables: README, diagram, video, Devpost, posts | 09-10 to 09-13 | submission filed |

Phases 3 and 4 touch disjoint files (`src/app/**`, `messages/**`,
`src/proxy.ts`, `src/i18n/**` versus `src/core/reconfirmation/**`,
`src/agent/runtime/**`, `src/agent/tools/notify.ts`, `infra/**`,
`src/app/api/ticks/route.ts` is owned by Phase 4) and both depend only on
Phase 2, so `/batch` may run them in parallel worktrees. Every other phase is
sequential. Each phase is its own conversation and stops for confirmation.

## 15. Deliverables and authorization gates

| Deliverable | Phase | Gate |
|---|---|---|
| Public MIT repo (exists), README with cc-rpi v1.28.2 disclosure | 6 | push to `main` through PR |
| Architecture diagram (`docs/architecture/`) | 6 | none |
| Five-minute video, four beats | 6 | owner records or approves the recording |
| Devpost entry, Everyday Agents track | 6 | owner action; needs AWS Builder ID |
| Live demo link `https://layalga.thecreativetoken.com` | 5 | Vercel production deploy authorization |
| Up to three builder.aws posts | 6 | drafts only; publication is a separate authorization |
| AgentCore runtime `layalga_agent`, S3 bucket `layalga-agent-bundles-106403001709`, roles `layalga-agentcore-runtime`, `layalga-scheduler-invoke`, IAM user `layalga-web`, SQS `layalga-scheduler-dlq` | 0, 4, 5 | pre-authorized by D3 |
| Google OAuth client, Supabase Google provider | 3 | D2 |

Pending owner actions outside the CLI: AWS Builder ID, Devpost registration.
Both are needed only for filing.

## 16. Environment variables

| Name | Where | Purpose |
|---|---|---|
| `DATABASE_URL` | all | Supabase session-mode pooler URL (`postgres` client, `prepare: false`) |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | web | Supabase Auth client |
| `SUPABASE_SECRET_KEY` | web server | Auth admin operations |
| `GOOGLE_OAUTH_CLIENT_ID` | local Supabase | Google OAuth Web client ID |
| `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET` | local Supabase | Google OAuth client secret; never committed |
| `AWS_REGION=us-east-1` | web, runtime | |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Vercel only | `layalga-web` user, `InvokeAgentRuntime` on one ARN |
| `BEDROCK_MODEL_ID` | runtime, local | default `us.anthropic.claude-sonnet-4-5-20250929-v1:0` |
| `AGENT_RUNTIME` | web | `agentcore` or `local` |
| `MODEL` | web, local | `bedrock` or deterministic `scripted` demo/test model |
| `AGENTCORE_RUNTIME_ARN` | web | |
| `SCHEDULER` | runtime, local | `eventbridge` or `none` |
| `SCHEDULER_ROLE_ARN`, `SCHEDULER_DLQ_ARN` | runtime, local | |
| `DEMO_MODE` | web | enables the clock panel and host switch |
| `DEMO_SESSION_SECRET`, `LINK_TOKEN_SECRET` | web | demo cookie signing and private-link token hashing |
| `TICK_SECRET` | web | explicit internal tick authentication for `/api/ticks` |
| `CRON_SECRET` | web | Vercel Cron bearer authentication for `/api/ticks` |
| `AGENT_ROUTE_SECRET` | web | separate release-probe authority for `/api/agent/run` |
| `HOST_EMAILS` | web | ordered allow-list for the first Google host claims |
| `APP_URL` | all | absolute guest links |

`.env.example` lists every name with a placeholder; `.env.local` is
gitignored and already holds the Supabase values.

## 17. Risks

| Risk | Mitigation |
|---|---|
| AgentCore TypeScript interrupt and resume fails inside the 6 h timebox | D7 and D8: the local runner is the fallback and is built anyway; ADR 0002 records the verdict |
| Scheduler's ~30 s synchronous timeout DLQs successful ticks | entrypoint acks immediately, `addAsyncTask` keeps `HealthyBusy`; Phase 4 verifies one real schedule end to end |
| Session snapshot not saved on interrupt stop | `saveLatestOn: 'message'`; Phase 0 asserts the snapshot contains `interrupts.activated = true` |
| Bedrock latency pushes a guest submit past the Vercel default duration | route `maxDuration = 300`, UI polls `runs` |
| Chapa days starve Phase 2 | Phase 2 is split into slices that each leave `main` green; slice 1 (storage plus scripted model) is the only one needed before 09-04 |
| Google OAuth client creation blocked | demo host switch and link token never depend on it |
| Docs lag the SDK (interrupt docs say "coming soon") | all SDK claims come from the 1.15.0 type definitions |

## 18. Deviations from the brief

- Seven tools instead of "about six"; `schedule_reconfirmation` folded into
  `confirm_visit` and `reschedule_visit` (D5).
- Escalation window confirmed at 24 hours (D1).
- The `pending_decision` fallback and the AgentCore path share the same
  persistence; the fallback changes deployment only (D7, D8).
