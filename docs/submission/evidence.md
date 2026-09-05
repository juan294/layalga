# Implementation evidence for L’Ayalga

This is the source-backed companion to the [judge guide](judge-guide.md). Each card connects a user benefit to an implementation decision and an inspectable test. The [Strands inventory](strands-usage.md) gives broader SDK detail; the [architecture index](../architecture/README.md) includes text-readable Mermaid sources.

## Current completion evidence

The completion source reference is **`54eab0860de93ae9d9289f228a4c6f38f24d8194`**, which includes the product phases completed at `618701c` and the reviewed benchmark implementation. The [judge guide](judge-guide.md) is the current product route; the cards below expose additional implementation details. Source and test links identify inspectable code, not a new test run performed by editing this index.

The [coordination evidence report](coordination-evidence.md) records the actual measured artifact, its own exact source revision, configuration and operation definitions. Its local scripted results are separate from the older baseline test totals preserved later in this document. Neither result measures human effort, live-model quality, production memory quality or inbox delivery. See the [participant protocol](participant-protocol.md) for the unmeasured human baseline.

### Cancellation closes outstanding authority

**Value and claim:** A guest or host explicitly confirms the reviewed current stay, or withdraws an unbooked invitation. Cancellation releases occupancy and retires obsolete decisions, runs, jobs and delivery work; natural language can prepare review but cannot commit cancellation.

**Source and tests:** [cancellation service](https://github.com/juan294/layalga/blob/54eab0860de93ae9d9289f228a4c6f38f24d8194/src/core/booking/cancellation.ts), [prepareCancellationTool](https://github.com/juan294/layalga/blob/54eab0860de93ae9d9289f228a4c6f38f24d8194/src/agent/tools/prepare-cancellation.ts), and [cancellation integration regressions](https://github.com/juan294/layalga/blob/54eab0860de93ae9d9289f228a4c6f38f24d8194/src/core/booking/cancellation.integration.test.ts).

**Mode and limit:** Local database/agent coverage exercises current-state and race boundaries. Withdrawal prevents subsequent send authorization; it cannot recall an already authorized in-flight external email. This supports technical implementation and a complete guest journey.

### Information and explicit requests have different effects

**Value and claim:** Informational notes remain visible without manufacturing a host decision. Captured explicit requests remain trusted and persist through resumption. Host changes to pets/children policy use version checks and serialize with booking; approval rechecks current rules.

**Source and tests:** [trusted task and resume handling](https://github.com/juan294/layalga/blob/54eab0860de93ae9d9289f228a4c6f38f24d8194/src/agent/run-task.ts), [policy settings service](https://github.com/juan294/layalga/blob/54eab0860de93ae9d9289f228a4c6f38f24d8194/src/core/policy/settings.ts), [tenant and request-integrity tests](https://github.com/juan294/layalga/blob/54eab0860de93ae9d9289f228a4c6f38f24d8194/src/agent/tenant-scope.test.ts), and [settings integration tests](https://github.com/juan294/layalga/blob/54eab0860de93ae9d9289f228a4c6f38f24d8194/src/core/policy/settings.integration.test.ts).

**Mode and limit:** Scripted/database tests exercise application authority. Omitting notes, arrival details and request prose from the guest-submit prompt is field minimization; raw host/change text and captured free-text facts can still identify people.

### Verified reminders give a guest controlled return access

**Value and claim:** Real reminder enrollment requires explicit consent and verified contact. Verification GET only reviews; POST verifies deliberately. Return capability authority is revalidated on every guest request and invalidated by applicable consent/access changes. Contact and send receipts stay in web-only services.

**Source and tests:** [guest contact service](https://github.com/juan294/layalga/blob/54eab0860de93ae9d9289f228a4c6f38f24d8194/src/core/notifications/guest-contact.ts), [guest outbox](https://github.com/juan294/layalga/blob/54eab0860de93ae9d9289f228a4c6f38f24d8194/src/core/notifications/guest-outbox.ts), [guest return browser journey](https://github.com/juan294/layalga/blob/54eab0860de93ae9d9289f228a4c6f38f24d8194/tests/e2e/guest-email.spec.ts), and [delivery integration tests](https://github.com/juan294/layalga/blob/54eab0860de93ae9d9289f228a4c6f38f24d8194/src/core/notifications/guest-delivery.integration.test.ts).

**Mode and limit:** Local tests inject a sender and use synthetic fixtures without real email. SES acceptance, definite failure and unknown send outcomes are distinct from inbox receipt or a guest reply. Production guest permissions and real-recipient proof remain pending in [guest email readiness](../release/guest-email-readiness.md).

### Memory affects feasible room recommendations

**Value and claim:** Trusted party-scoped recall can rank valid room combinations using supported floor/bed preferences. Guests see matches, unmatched preferences or an honest fallback and retain manual selection. Standard capacity and room count precede preference ranking.

**Source and tests:** [loadPartyRoomPreferences](https://github.com/juan294/layalga/blob/54eab0860de93ae9d9289f228a4c6f38f24d8194/src/core/memory/room-preferences.ts), [recommendRooms](https://github.com/juan294/layalga/blob/54eab0860de93ae9d9289f228a4c6f38f24d8194/src/core/rooms/recommendation.ts), and [actual guest-search integration tests](https://github.com/juan294/layalga/blob/54eab0860de93ae9d9289f228a4c6f38f24d8194/src/core/booking/guest-preferences.integration.test.ts).

**Mode and limit:** Mocked-memory/local database tests cover the actual search integration. This bounded direct read is separate from SDK `search_memory` recall. Unsupported or conflicting input cannot become an invented requirement; a ground-floor label is not an accessibility guarantee.

### The guided clock follows saved work

**Value and claim:** Fresh routine and exception scenarios demonstrate booking, answered reconfirmation, approval and unanswered follow-up. Semantic controls choose eligible persisted jobs, preserve retry/lease/current-cycle guards and report when no work remains. Guest defaults and search use household time, while real access expiry remains real-time.

**Source and tests:** [semantic clock service](https://github.com/juan294/layalga/blob/54eab0860de93ae9d9289f228a4c6f38f24d8194/src/core/demo/advance-clock.ts), [clock integration tests](https://github.com/juan294/layalga/blob/54eab0860de93ae9d9289f228a4c6f38f24d8194/src/core/demo/advance-clock.integration.test.ts), [guest search clock tests](https://github.com/juan294/layalga/blob/54eab0860de93ae9d9289f228a4c6f38f24d8194/src/core/booking/guest-clock.integration.test.ts), and [guided browser regression](https://github.com/juan294/layalga/blob/54eab0860de93ae9d9289f228a4c6f38f24d8194/tests/e2e/guided-demo.spec.ts).

**Mode and limit:** Synthetic local English and Spanish/mobile journeys use explicit shared resets. Simulated time jumps are not production uptime, and automated action durations are not human time saved.

These current cards complement the five-criterion mapping in the judge guide. New completion features are locally implemented; production rollout and publication are separate pending actions. Historical AgentCore observations, the pending video and unpublished Builder drafts must not be represented as current deployment or publication proof.

## Historical baseline: revision and evidence status

All source and test permalinks below refer to the integration baseline **`bf5041601b8910f92e632034c4c21b644dc6a3a9`**, inspected on **2026-09-05**. Symbols support navigation in later checkouts; pinned lines preserve what was actually inspected. Feature-branch work is outside this evidence snapshot.

**Status for every historical baseline card: implemented source inspected; test exists and inspected.** These labels do not assert a fresh passing test run. Local validation results, if recorded for a later documentation commit, apply to that stated revision and environment. Historical deployment observations are recorded in [ADR 0002](../decisions/0002-agent-runtime.md); they are not a fresh observation of this snapshot. No uploaded video URL is recorded in the submission draft at this baseline.

## Human approval refreshes booking authority

**Claim:** Before a hold, confirmation, or reschedule tool executes, trusted booking inputs and deterministic rules decide whether it proceeds, is denied, or pauses through Strands `event.interrupt`. After approval, the hook reloads availability and checks whether the reviewed overflow arrangement changed.

**Product value:** A host can decide asynchronously without approving obsolete capacity or room arrangements.

**Criteria:** Technical Implementation; Design.

**Implementation:** `installPolicyHook` ([src/agent/policy-hook.ts:37](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/policy-hook.ts#L37)), interrupt ([src/agent/policy-hook.ts:82](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/policy-hook.ts#L82)), refreshed verdict ([src/agent/policy-hook.ts:99](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/policy-hook.ts#L99)).

**Verification:** Changed house state and changed room-label cases: [src/agent/policy-hook-refresh.test.ts:58](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/policy-hook-refresh.test.ts#L58) and [src/agent/policy-hook-refresh.test.ts:163](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/policy-hook-refresh.test.ts#L163).

**Operating mode:** Same policy hook in local and AgentCore agent construction; refresh tests isolate it with mocked dependencies.

**Revision/status:** the pinned baseline and inspected-only status above.

**Limitations:** The hook gates three booking tools, not every tool in the application. Transaction checks and database constraints provide additional authority boundaries.

## Strands interrupt and resume across processes

**Claim:** A paused tool has a persisted Strands session and a separate host decision record. A later run restores the session and supplies `InterruptResponseContent`; decision application is recorded separately from approval.

**Product value:** A host does not need to answer before the original worker exits.

**Criteria:** Technical Implementation; Design.

**Implementation:** `buildAgent` configures `SessionManager` ([src/agent/agent.ts:47](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/agent.ts#L47)); `PostgresStorage` ([src/agent/storage/postgres-storage.ts:23](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/storage/postgres-storage.ts#L23)); `executeClaimedAgentTask` restores the response ([src/agent/run-task.ts:383](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/run-task.ts#L383)).

**Verification:** The integration case at [src/agent/interrupt-resume.test.ts:43](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/interrupt-resume.test.ts#L43) launches a separate Node process at [src/agent/interrupt-resume.test.ts:111](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/interrupt-resume.test.ts#L111) and asserts one tool audit and one applied decision at [src/agent/interrupt-resume.test.ts:143](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/interrupt-resume.test.ts#L143). It also checks a declined request writes no visit.

**Operating mode:** Local PostgreSQL and scripted model, exercising the actual Strands session/interrupt machinery.

**Revision/status:** the pinned baseline and inspected-only status above.

**Limitations:** This is evidence for the tested restart, approval, and decline paths, not a universal exactly-once guarantee under every distributed failure.

## PostgreSQL independently rejects competing room claims

**Claim:** Booking runs in a transaction with trusted room allocation and policy checks. A PostgreSQL GiST exclusion constraint rejects overlapping active ranges for the same room even when the application home lock is deliberately disabled in a test.

**Product value:** Two independent hosts or guests cannot both win the final room in the covered race.

**Criteria:** Technical Implementation; Creativity & Originality.

**Implementation:** `createTemporaryHold` ([src/core/booking/holds.ts:133](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/core/booking/holds.ts#L133)); room-range exclusion constraint ([supabase/migrations/20260831000100_core.sql:90](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/supabase/migrations/20260831000100_core.sql#L90)).

**Verification:** Twenty final-room races ([src/core/booking/holds.concurrency.test.ts:180](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/core/booking/holds.concurrency.test.ts#L180)), no-home-lock race ([src/core/booking/holds.concurrency.test.ts:186](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/core/booking/holds.concurrency.test.ts#L186)), and visit versus private block ([src/core/booking/holds.concurrency.test.ts:514](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/core/booking/holds.concurrency.test.ts#L514)).

**Operating mode:** Local PostgreSQL integration tests; the invariant is enforced in the database, independently of model choice.

**Revision/status:** the pinned baseline and inspected-only status above.

**Limitations:** The exclusion constraint protects room/date overlap. Social rules still depend on trusted policy and transaction logic; it is not a database constraint for every house rule.

## Accepted work has durable run identity and leases

**Claim:** AgentCore dispatch persists a task before invocation. The queue has bounded concurrency, attempt limits, and expired-lease recovery; callers receive a run identity that can be followed to a terminal outcome.

**Product value:** The browser can acknowledge a request without holding the original web request open for model execution.

**Criteria:** Technical Implementation; Design.

**Implementation:** `AgentCoreClient` ([src/agent/client.ts:24](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/client.ts#L24)); `drainAgentQueue` ([src/agent/queue.ts:23](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/queue.ts#L23)); `reconcileStaleRuns` ([src/core/reconfirmation/jobs.ts:663](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/core/reconfirmation/jobs.ts#L663)).

**Verification:** Persist-before-execution case ([src/agent/queue.test.ts:201](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/queue.test.ts#L201)), bounded claims ([src/agent/queue.test.ts:278](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/queue.test.ts#L278)), and live-lease protection ([src/agent/queue.test.ts:328](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/queue.test.ts#L328)).

**Operating mode:** Queue integration tests use local PostgreSQL. `AGENT_RUNTIME=agentcore` selects remote execution; `AGENT_RUNTIME=local` selects the local worker.

**Revision/status:** the pinned baseline and inspected-only status above.

**Limitations:** Accepted means queued work, not completed reasoning. Exhausted attempts can fail; these tests do not independently establish live AgentCore availability.

## Reconfirmation recovery covers recipients the model omits

**Claim:** The state machine requests reconfirmation before arrival and escalates an unanswered request after 24 hours. After model execution, deterministic delivery fills missing required notification records. Jobs use leases, bounded retry, quarantine, and explicit replay.

**Product value:** Proactive coordination remains accountable when the model skips a host or a worker only partially delivers.

**Criteria:** Technical Implementation; Creativity & Originality; Potential Impact.

**Implementation:** `applyChase` ([src/core/reconfirmation/state-machine.ts:48](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/core/reconfirmation/state-machine.ts#L48)); `deliverRequiredNotifications` ([src/core/reconfirmation/jobs.ts:377](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/core/reconfirmation/jobs.ts#L377)); `recordJobFailure` ([src/core/reconfirmation/jobs.ts:522](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/core/reconfirmation/jobs.ts#L522)); `replayQuarantinedJob` ([src/core/reconfirmation/jobs.ts:314](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/core/reconfirmation/jobs.ts#L314)).

**Verification:** Partial escalation ([src/core/reconfirmation/jobs.test.ts:123](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/core/reconfirmation/jobs.test.ts#L123)), skipped host ([src/core/reconfirmation/jobs.test.ts:170](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/core/reconfirmation/jobs.test.ts#L170)), quarantine/replay ([src/core/reconfirmation/jobs.test.ts:210](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/core/reconfirmation/jobs.test.ts#L210)), and dispatched fallback ([src/core/reconfirmation/jobs.test.ts:414](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/core/reconfirmation/jobs.test.ts#L414)).

**Operating mode:** Local PostgreSQL with a scripted invoker/fake clock for deterministic coverage; shared state machine and job services support deployed scheduling.

**Revision/status:** the pinned baseline and inspected-only status above.

**Limitations:** A persisted in-app notification does not prove delivery to an email inbox. SES, consent, and outbox processing are separate boundaries. No real-world time-saving measurement is claimed.

## AgentCore Memory follows task and party boundaries

**Claim:** Guest memory stores are scoped to the authorized party. Host capture reads without conversation extraction; an unmatched capture can read the household subtree. Host room requests have no store. Recall is tool-driven, with injection and `add_memory` disabled.

**Product value:** Returning preferences can inform coordination while task authority limits which memory store is available.

**Criteria:** Technical Implementation; Design.

**Implementation:** `memoryStoresForTask` ([src/agent/memory.ts:53](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/memory.ts#L53)); `memoryConfigForTask` ([src/agent/memory.ts:125](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/memory.ts#L125)); the raw-capture rationale ([src/agent/memory.ts:38](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/memory.ts#L38)).

**Verification:** No room-request store ([src/agent/memory.test.ts:35](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/memory.test.ts#L35)), no host-capture extraction ([src/agent/memory.test.ts:74](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/memory.test.ts#L74)), namespace boundaries ([src/agent/memory.test.ts:111](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/memory.test.ts#L111)), and search-only configuration ([src/agent/memory.test.ts:143](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/memory.test.ts#L143)).

**Operating mode:** Available with `MEMORY=agentcore`; `MEMORY=none` attaches no memory. Configuration tests do not require a live AgentCore Memory service.

**Revision/status:** the pinned baseline and inspected-only status above.

**Limitations:** Raw host invitations can contain names. `minimizeProviderPrompt` applies specific pattern replacements ([src/agent/prompt-minimization.ts:11](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/prompt-minimization.ts#L11)), not general personal-information removal. Store scoping does not guarantee arbitrary input or extracted content is name-free.

## Scripted tests exercise the real Strands framework

**Claim:** The deterministic model implements the Strands `Model` interface and feeds the same `buildAgent` factory, typed tools, hooks, storage, and sequential executor used by the Bedrock-backed agent.

**Product value:** Restart, policy, and tracing behavior can be reproduced locally without relying on model wording or spending cloud inference budget.

**Criteria:** Technical Implementation.

**Implementation:** `ScriptedModel` ([src/agent/scripted-model.ts:18](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/scripted-model.ts#L18)); `buildAgent` ([src/agent/agent.ts:28](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/agent.ts#L28)).

**Verification:** Cross-process tool execution ([src/agent/interrupt-resume.test.ts:43](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/interrupt-resume.test.ts#L43)); `invoke_agent` and `execute_tool` telemetry span assertions ([src/agent/telemetry.test.ts:49](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/telemetry.test.ts#L49)).

**Operating mode:** Scripted local execution for reproducibility; the selected production model is configured separately.

**Revision/status:** the pinned baseline and inspected-only status above.

**Limitations:** Deterministic framework and span tests do not measure Bedrock reasoning quality, multilingual output reliability, or CloudWatch delivery.

## An explicit demo clock drives the application state machine

**Claim:** `DbDemoClock.load` uses injected time only when both the clock and the demo-home flag allow it. Ordinary homes fall back to system time. Demo jobs are excluded from the general due-job scan unless a home is explicitly selected.

**Product value:** Reconfirmation and escalation can be demonstrated in minutes with synthetic elapsed time clearly separated from ordinary scheduling.

**Criteria:** Presentation; Technical Implementation.

**Implementation:** `DbDemoClock.load` ([src/core/clock.ts:55](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/core/clock.ts#L55)); `claimDueJob` demo-home selection ([src/core/reconfirmation/jobs.ts:553](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/core/reconfirmation/jobs.ts#L553)).

**Verification:** Demo-home clock guard ([src/core/clock.test.ts:25](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/core/clock.test.ts#L25)); home-scoped job runner ([src/core/reconfirmation/jobs.test.ts:107](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/core/reconfirmation/jobs.test.ts#L107)); chase and escalation lifecycle ([src/core/reconfirmation/jobs.test.ts:62](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/core/reconfirmation/jobs.test.ts#L62)).

**Operating mode:** Synthetic demo home and fake-clock tests; the same reconfirmation functions govern normal scheduling.

**Revision/status:** the pinned baseline and inspected-only status above.

**Limitations:** Accelerated timestamps demonstrate transitions, not elapsed production uptime. Shared demo state can already have been changed by another visitor.

## Reproduce local verification

Use Node.js 24, pnpm 11, Docker, and the local Supabase setup in the [README](../../README.md#local-setup). Tests that manipulate fixtures must target an isolated local database. Configure the local app with `AGENT_RUNTIME=local`, `MODEL=scripted`, `MEMORY=none`, `EMAIL=none`, and `SCHEDULER=none`; enable the synthetic demo and use local secrets from the setup procedure.

Follow the sequential commands in the [README local checks](../../README.md#local-setup), the [CI test selection](../../.github/workflows/ci.yml), and the [release playbook's local demo and probes](../release/e2e-pro-playbook.md#executable-local-verification). Browser tests additionally require the configured Playwright browsers. These linked procedures are the canonical command recipes.

Local scripted probes cover application flow. A deployed candidate needs separate authorized runtime, model, memory, email, and observability checks; local success cannot substitute for those observations.

## Historical baseline verification recorded on 2026-09-05

The documentation implementation was checked locally on Node.js 24.19.0 and
pnpm 11.22.0, against the executable source at the pinned integration baseline.
The only source edit in this documentation change clarifies the trace-attribute
comment; runtime behavior and test code are unchanged. Supabase used a separate
local project and database, and the app used local execution, a scripted model,
no memory service, and no email service. Checks ran sequentially.

| Check                                        | Observed result                                                                                                  |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Bootstrap, typecheck, lint, production build | Passed                                                                                                           |
| Unit coverage selection                      | 351 tests passed; coverage thresholds passed (41.14% statements, 40.87% branches, 43.23% functions, 41.8% lines) |
| Full test suite                              | 462 tests passed across 103 files                                                                                |
| CI integration selection                     | 111 tests passed across 30 files                                                                                 |
| Browser suite                                | 15 tests passed, including Chromium and mobile WebKit                                                            |
| Deterministic demo                           | Passed, including room approval and calendar privacy checks                                                      |
| Local release probes                         | All nine passed, including cleanup                                                                               |
| `/llms.txt` HTTP check                       | 200 `text/plain`, exact file contents, no redirect or cookie for English and Spanish requests                    |

The source cards' inspected-test status remains separate from this dated local
run. These results establish local behavior; they do not establish a new
AgentCore deployment, live-model performance, public video, or SES delivery.
The static index's production-branch links are published when this change is
released; checking their local targets does not claim they are already online.
