# Strands Agents usage in L’Ayalga

This document maps the completion implementation at `618701c` (5 September 2026) to actual SDK integration. Start with the [judge guide](judge-guide.md) for the product/evidence route. The current configuration selects Claude Sonnet 4.6 on Bedrock; local scripted tests do not measure that model's quality. New completion capabilities have not yet been rolled out to production.

## 1. Agent construction and execution

[`buildAgent`](../../src/agent/agent.ts) constructs the Strands `Agent` with a model, task-specific tools, locale-specific system prompt, sequential tool execution and a `SessionManager`. [`PostgresStorage`](../../src/agent/storage/postgres-storage.ts) persists SDK sessions in PostgreSQL. `saveLatestOn: "message"` preserves progress, including the conversation surrounding an interruption.

The Bedrock path wraps `BedrockModel` in [`PromptMinimizingModel`](../../src/agent/prompt-minimization.ts). Scripted execution supplies a model explicitly. Memory configuration is optional; when enabled, `MemoryManager` is passed to the Agent and search audit hooks are installed. The policy hook is always installed.

Trace attributes contain household/task/session identifiers rather than display names. This does not establish that arbitrary user text or provider spans are free of personal information. Raw host and guest-change messages can contain such information.

[`runTask`](../../src/agent/run-task.ts) resolves trusted authority, assembles the task prompt, invokes or resumes the SDK agent and writes the run outcome. The surrounding queue handles idempotency, claims, leases and recovery. The web app can dispatch to [`AgentCore`](../../src/agent/runtime/handler.ts); run results identify where execution occurred. A deterministic guest search or a contact preference action is not itself an AgentCore agent run.

## 2. Project tool inventory

[`buildTools`](../../src/agent/deps.ts) is the authoritative inventory and task exposure map. There are eleven project tools; the SDK can additionally provide `search_memory` when configured.

| Tool | Bounded application role |
| --- | --- |
| `capture_invitation` | Structures an authorized host invitation and returns invitation/party identifiers. The private link is delivered by the application outside the model transcript. |
| `find_visit_options` | Searches candidate stays using capacity and anonymous overlap information. |
| `evaluate_overlap` | Evaluates deterministic booking rules without committing a booking. |
| `create_temporary_hold` | Writes a temporary hold after trusted policy and room checks. |
| `confirm_visit` | Confirms an authorized current hold and schedules follow-up. |
| `reschedule_visit` | Changes a visit under current room, policy and authority checks. |
| `prepare_cancellation` | Returns a review instruction for the authorized visit; never cancels it. |
| `notify` | Writes permitted in-app notifications for the authorized task and recipients. |
| `list_guest_rooms` | Reads guest-safe room inventory without private room notes. |
| `find_room_options` | Searches exact-stay room combinations and preference explanations within trusted scope. |
| `prepare_room_action` | Prepares a bounded private-block/open/close proposal for explicit host application. |

A `host_room_request` receives the three room tools. Other tasks receive the booking/capture/notification tools; cancellation preparation is additionally exposed only to `guest_change`, `guest_reconfirm` and `resume`. Tool availability does not confer authority: callbacks validate trusted host, invitation, party, visit or job context and reject cross-household access.

## 3. The policy hook is a pre-write boundary

[`installPolicyHook`](../../src/agent/policy-hook.ts) subscribes to Strands tool-call events and gates hold creation, confirmation and rescheduling. It loads the trusted booking draft, runs room-selection and overlap verdicts, and audits the result. Model arguments cannot supply host approval, replace the authorized selection or invent overflow consent.

A deny cancels the tool call with a fixed explanation. An interrupt invokes the SDK's `event.interrupt` mechanism before the guarded booking operation proceeds. Capacity/occupancy denial takes precedence over a social request. Household children/pets rules are host-configurable and versioned; they remain deterministic constraints, not suggestions to the model.

On resume, the application reconstructs the trusted proposal and rechecks current policy, selected rooms and approval integrity. A changed policy or room arrangement can make the old approval inapplicable. See [`policy-hook-refresh.test.ts`](../../src/agent/policy-hook-refresh.test.ts) and [`settings.integration.test.ts`](../../src/core/policy/settings.integration.test.ts).

## 4. Durable human interruption and cancellation

The SDK snapshot, pending decision and application run are distinct records. The host action saves a decision; the resume path supplies `InterruptResponseContent` to the paused execution. Applied-run tracking and current-claim checks prevent a stale or duplicate worker from applying a decision again. Failed application is visible and can receive an authorized retry.

[`run-task.ts`](../../src/agent/run-task.ts) serializes interruption persistence with household cancellation. [`cancellation.ts`](../../src/core/booking/cancellation.ts) retires obsolete decisions, runs, jobs and queued delivery while releasing occupancy. A cancelled decision cannot be treated as pending. The agent can prepare a cancellation review, including for language outside the lexical fast path, but only a fresh explicit guest/host confirmation commits cancellation or withdrawal.

These are application authority guarantees around the SDK, not model promises. See [cancellation integration tests](../../src/core/booking/cancellation.integration.test.ts), [tenant tests](../../src/agent/tenant-scope.test.ts) and [guest browser coverage](../../tests/e2e/guest-link.spec.ts).

## 5. Informational notes are not decision requests

The task schema and trusted submission distinguish informational notes from explicit requests. Captured requests remain immutable; additional requests are bounded, persisted and reconstructed for resumed policy checks. An ordinary thank-you can proceed through hold and confirmation without interruption. Notes remain visible in authorized visit details and follow the terminal retention policy.

The guest-submit prompt is assembled without notes, arrival details or explicit request prose. Policy obtains requests from trusted state instead of asking the model to reproduce them. This omission also keeps those raw fields out of the conversation presented for memory extraction. [`prompt-minimization.test.ts`](../../src/agent/prompt-minimization.test.ts) and the [tenant suite](../../src/agent/tenant-scope.test.ts) cover the actual task path, rather than only a legacy regular expression.

## 6. Memory: agent recall and bounded room ranking

[`memory.ts`](../../src/agent/memory.ts) configures SDK recall with prompt injection and `add_memory` disabled. Scoped `search_memory` calls are audited. Guest tasks can access only their authorized party scope. Host capture without a matched party can use household-scoped read-only recall. Recall can inform a summary and separate remembered context; it cannot rewrite party counts, dates, arrival time or requests.

Host capture conversations are excluded from automatic extraction because raw messages can contain names. [`recordCaptureMemory`](../../src/agent/record-capture-memory.ts) instead omits the family-name field and writes bounded capture facts with a run-based idempotency token. Free-text arrival and request facts can still identify people. Guest-change text is still free text processed by the agent; this design is not a universal personal-information scrubber.

Room recommendation has a separate deterministic read path. [`loadPartyRoomPreferences`](../../src/core/memory/room-preferences.ts) validates household/party scope and bounds retrieval by deadline, pages and record count. It recognizes only ground-floor, upper-floor, separate-bed and double-bed preferences. Negative, uncertain, unsupported, conflicting or oversized input falls back without inventing a preference.

[`recommendRooms`](../../src/core/rooms/recommendation.ts) ranks feasible room combinations; [`preferences.ts`](../../src/core/rooms/preferences.ts) matches preferences and creates their explanations. [`guest-actions.ts`](../../src/core/booking/guest-actions.ts) integrates that read in the actual web guest search; [`find-room-options.ts`](../../src/agent/tools/find-room-options.ts) supports the corresponding tool path. Memory never changes eligibility, consent or the guest's manual choice. This direct read is not an SDK `search_memory` span and should not be presented as one.

## 7. Scheduled work and delivery

The agent helps phrase bilingual follow-up, while [`jobs.ts`](../../src/core/reconfirmation/jobs.ts) owns due work, leases, current-cycle checks, retries and required-recipient fallback. Guest answers, rescheduling and cancellation invalidate obsolete follow-up. Demo shortcuts select real eligible jobs through [`advance-clock.ts`](../../src/core/demo/advance-clock.ts), preserving lease and pre-arrival rules.

Email is outside the agent's tool authority. The web-owned [guest contact service](../../src/core/notifications/guest-contact.ts) implements explicit consent, verification, return capability resolution and opt-out. The [guest outbox](../../src/core/notifications/guest-outbox.ts) checks current authority and records an authorized attempt before provider submission. Guest contacts/outbox/attempts are unavailable to the agent database role. SES acceptance is not inbox receipt; uncertain outcomes are not blindly retried.

## 8. Evidence boundaries

The [judge guide](judge-guide.md) maps source and tests to all judging criteria. [Coordination evidence](coordination-evidence.md) reports the exact local scripted benchmark configuration and results. It does not establish live-model quality, real memory recall, human time saved or email receipt.

The [AgentCore trace screenshot](assets/agentcore-trace.png) was captured from the earlier September 2026 production runtime. It remains useful historical runtime evidence, with its original model/version context. Current implementation and historical deployment must not be conflated. The [runtime runbook](../release/runtime-database-and-identity.md) and [guest email readiness](../release/guest-email-readiness.md) describe the separate production activation work.
