# Phase 1. Require an explicit party choice

**Finding** SE-H1  
**Schema** Current migration set and unique name constraint

## Change

Add localized **New party** and **Returning party** choices to the host capture form. Default to New. For Returning, require an explicit selection from the signed-in host's household. Label choices with the name, last invitation date and last stay where available. Omit guest contact details, account identifiers and notes from choices. Preserve the draft when validation fails. The selected existing ID supplies the only prior party authority. The model proposes a display name for a new record and describes the visit. It cannot select an existing record or rename one.

Use a versioned `host_capture_v2` task carrying the explicit choice and a UUID for the logical capture submission. Hold that UUID through transport retries and failed attempts of the same submission. Start a fresh UUID for a deliberate new capture, including when the message is identical. Treat reuse of a UUID with altered form data as invalid and ask the host to submit the edited draft as new. Key v2 intents by task, authenticated host and capture UUID under the existing home-scoped unique key. Compare canonical stored input before replay in the same transaction. If retention has cleared the original input, disclose that the request cannot be replayed. Keep the existing queue retry limits and per-host session serialization. Count legacy and v2 captures against the same host and household capture limits. Make the new discriminator supported by web and worker parsers, dispatch, task authorization, session and retry handling, prompts, memory, scripted model and release probes.

The bridge worker accepts old queued or old-web `host_capture` tasks as **New only**. It never attaches one to an existing party based on text. While the old uniqueness constraint exists, a new capture with an already-used name fails with a safe, localized recovery path. An explicit returning choice continues to work. Use a stable public failure reason or the existing localized run-outcome mapping with a fixed summary. Keep private SQL/model details in the existing server error boundary.

Check host and party membership before enqueue, on claim and again inside the write transaction. Legacy and New tasks get no existing party memory and no whole-house fallback for invitation capture. Returning tasks can read only the verified existing party namespace and never extract the host transcript. Continue recording the bounded capture facts for the actual new or selected party after capture. Preserve guest and host-room task behavior. Disable or remove surname-based logic after its last caller is gone. [Current tool](../../../src/agent/tools/capture-invitation.ts#L24), [Capture task memory scope](../../../src/agent/memory.ts#L31), [Capture memory writer](../../../src/agent/record-capture-memory.ts#L14), [Intent key](../../../src/agent/run-task.ts#L873).

```text
@ authorizeCapture(task, authenticatedHost) -> authorizedPartyChoice
ctx: host household, persisted task, party store
do:
  1. validate authenticated host and task household
  2. map the legacy discriminator to New
  3. look up Returning ID in this home before memory or writes
  4. lock and use that ID in the capture transaction
br: New -> insert distinct party with no prior recall
fail: missing or stale choice -> show recovery without memory or invitation writes
```

## Stuck states and recovery

| State and who sees it                                                           | What ends it                                                                                                                                                                        | Required evidence                                                                                                      |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Host submits Returning with no choice, or loses a choice while the form is open | Field-linked localized message. Keep the draft and allow another explicit selection or New.                                                                                         | Submit empty and removed fixture IDs. Check error, draft and successful correction.                                    |
| Host submits New with a name that collides during the bridge                    | Indicate the name is already used. The host can explicitly choose the existing record if it is the same party, or use a distinct display label for a different party until Phase 2. | Existing schema test shows no invite attached. Browser then succeeds through each correct route.                       |
| A bridge worker consumes a legacy task with an ambiguous name                   | Fail without borrowing account or memory. The host can open capture and make a new explicit choice.                                                                                 | Old payload with existing name produces no new invitation under that party. Current bridge UI explains how to restart. |
| A stale old worker sees the new discriminator                                   | Existing safe invalid-task path terminates the request. The host gets a failure and can return to capture with the compatible worker.                                               | Run the prior fixture parser against the v2 payload and assert refusal. Replay through both new adapters.              |
| Duplicate submit or failed transport                                            | Retry the same logical submission and recover the same run. An edit prompts a deliberate new submission.                                                                            | Replay one UUID, then test altered payload and a second new UUID with identical text.                                  |

## Acceptance

**Automated**

- Extend `src/agent/task.test.ts`, `src/agent/queue.test.ts`, `src/agent/tools/capture-invitation.test.ts` and `src/agent/tenant-scope.test.ts`. Assert selection survives local dispatch and the AgentCore handler, foreign IDs are refused at claim and write, and the task preserves queue retry behavior and mixed-version captures share one request budget.
- Replace tests which expect a surname to scope memory with tests in `src/agent/memory-capture-safety.test.ts` and `src/agent/record-capture-memory.test.ts` checking New and Returning, including a pasted name that matches a different party. Release probe selects its fixture Vega ID explicitly and asserts recall to that party.
- Extend `tests/e2e/host-view.spec.ts` for both choices, draft retention, keyboard selection and runtime failure recovery. Test legacy completed capture still resolves under the existing reveal rules until Phase 3.
- Run the common gates against the current schema. Keep proof of old web to new runtime and new web to old runtime behavior using synthetic tasks. Record the bridge source identity for Phase 2.

**Manual**

On the fixture host dashboard, read the returning choices in English and Spanish. At 390 px and by keyboard only, confirm the label gives enough context to distinguish records, New is clear, and a validation error points back to the choice without losing the invitation draft.

## Owned work and consumer sweep

One integration owner. Schema-free identity flow, queue contract and test fixtures share the same task shape, so no parallel implementation unit is batch-eligible in this phase.

Commands used at planning time:

```sh
git grep -l -E 'host_capture|captureInvitation\(|matchedPartyIdForCapture|matchFamilyNameInMessage' -- src tests scripts .design-sync
git grep -l -E 'agentTaskSchema|authorityForTask|actorKeyForTask|intentKeyForTask' -- src scripts
```

- **Phase 1 task pipeline.** `src/agent/` task, client, queue and run-task, AgentCore handler and local adapter, memory and record-capture-memory, scripted-model-selection, ports, party-match, and the capture tool. Sweep their direct tests covering agent flow, task, queue, tenant scope, memory, telemetry, scripted selection, prompt minimization, run safety and runtime adapters. Keep old-form fixtures where they explicitly test compatibility.
- **Phase 1 actions and callers.** Host actions and tests, host dashboard, capture form and its tests, frontend-boundaries test, API agent route and tests, `.design-sync/shims/host-actions.ts`, host browser specs. Teach the existing reveal query both discriminators as bridge compatibility. It moves to Phase 3's shared resolver later.
- **Phase 1 automation.** `scripts/agent-smoke.ts`, `scripts/agentcore-smoke.ts`, `scripts/release-helpers.ts`, `scripts/release-probes.ts` and their tests, plus `src/agent/testing/seed-host.ts` as a fixture producer. Update positive new captures to v2 and make the release memory probe explicitly choose a fixture party.
- **Phase 2 account, schema and unchanged writers.** Guest OAuth, visit listing and cancellation retain party ID semantics. Shared fixtures and direct writers are covered by the Phase 2 sweep. `src/lib/server/action-errors.ts`, `src/lib/text-fold.ts`, host activity labels, run readback, notification, and host memory data only inspect named markers, errors or presentation unless the source sweep finds an applicable predicate. Verify their existing behavior with the full suites.
