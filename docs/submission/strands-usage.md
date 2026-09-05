# How L'Ayalga uses the Strands Agents SDK

Date: 2026-09-05. Source baseline: [`bf5041601b8910f92e632034c4c21b644dc6a3a9`](https://github.com/juan294/layalga/tree/bf5041601b8910f92e632034c4c21b644dc6a3a9) on `develop`; package version 0.5.1. Code line references below refer to that immutable revision. Historical runtime observations retain their original dates.

This is an inventory of every Strands Agents SDK feature the project uses, with the file that uses it. Code pointers and excerpts identify the implementation; excerpts omit surrounding code. Tests are linked as inspectable evidence, not a claim that they were rerun for this documentation update. See the [evidence guide](evidence.md) for evidence status and limits.

Versions from `package.json`:

| Package               | Version |
| --------------------- | ------- |
| `@strands-agents/sdk` | 1.16.0  |
| `bedrock-agentcore`   | 0.4.3   |
| `zod`                 | 4.5.2   |

Agent-driven paths share one factory, `buildAgent` in `src/agent/agent.ts`. The task schema accepts seven kinds: `host_capture`, `host_room_request`, `guest_submit`, `guest_change`, `guest_reconfirm`, `resume`, and `tick` ([src/agent/task.ts:22-91](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/task.ts#L22-L91)). An affirmative `guest_reconfirm` answer completes deterministically before agent construction ([src/agent/run-task.ts:307-325](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/run-task.ts#L307-L325)); paths requiring the agent invoke it inside a durable database run.

---

## 1. `Agent` construction

**The feature.** `Agent` is the SDK's event loop: it calls the model, executes tool calls, fires hooks, and persists state through the options it is given.

**How L'Ayalga uses it.** One factory builds every agent ([src/agent/agent.ts:44-68](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/agent.ts#L44-L68)):

```ts
const agent = new Agent({
  model: selectedModel,
  tools: buildTools(deps, task),
  sessionManager: new SessionManager({
    sessionId,
    storage: new PostgresStorage(sqlClient(deps.db), sessionId).namespace(
      "session",
    ),
    saveLatestOn: "message",
  }),
```

followed by `systemPrompt`, `printer: false`, `toolExecutor: "sequential"`, `traceAttributes`, and a conditional `memoryManager` ([src/agent/agent.ts:54-68](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/agent.ts#L54-L68)). Two hooks are attached right after construction ([src/agent/agent.ts:69-70](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/agent.ts#L69-L70)).

Each option carries a product decision:

- `model` is either the Bedrock model wrapped in a prompt minimizer or a scripted model (section 2).
- `tools` is scoped per task, so a room request never sees booking tools (section 3).
- `sessionManager` stores the conversation in Postgres so a run can be resumed in another process (section 6).
- `systemPrompt` is chosen by locale, and a `resume` task gets a suffix that tells the model to write its summary in the deciding host's language ([src/agent/agent.ts:40-43](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/agent.ts#L40-L43), [src/agent/system-prompt.ts:18-21](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/system-prompt.ts#L18-L21)).
- `printer: false` because the agent runs in a server process; nothing should be written to stdout.
- `toolExecutor: "sequential"`. The SDK default is concurrent (`node_modules/@strands-agents/sdk/dist/src/agent/agent.d.ts:47-57`). Sequential execution means the policy hook evaluates each gated call against the database state left by the previous call, and an interrupt halts the loop before the next tool runs.
- `traceAttributes` carries ids only, never a name (section 8).
- `memoryManager` is spread in only when a store applies. `MemoryManager` throws with zero stores, so the option is omitted rather than passed empty ([src/agent/agent.ts:64-68](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/agent.ts#L64-L68), [src/agent/memory.ts:114-128](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/memory.ts#L114-L128)).

**Why it matters.** One construction path means agent-driven task, test, and demo paths get the same hooks, the same storage, and the same trace attributes. There is no second agent for tests.

**Files.** `src/agent/agent.ts`, `src/agent/system-prompt.ts`.

---

## 2. Models: `BedrockModel`, a wrapper, and a scripted `Model`

**The feature.** `Model` is the SDK's abstract provider class. `BedrockModel` implements it over the Bedrock Converse API. Any subclass that implements `stream`, `updateConfig`, and `getConfig` can be handed to `Agent`.

**How L'Ayalga uses it.** Production constructs `BedrockModel` from the environment and wraps it ([src/agent/agent.ts:74-85](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/agent.ts#L74-L85)):

```ts
return new PromptMinimizingModel(
  new BedrockModel({
    region: config.awsRegion!,
    modelId: config.bedrockModelId!,
  }),
);
```

`PromptMinimizingModel` extends `Model`, delegates `stateful`, `updateConfig`, and `getConfig`, and rewrites `TextBlock` content on the way into both `stream` and `countTokens` ([src/agent/prompt-minimization.ts:21-53](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/prompt-minimization.ts#L21-L53)). The rewrite removes host and family names from prompt shapes still present in older session snapshots ([src/agent/prompt-minimization.ts:11-19](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/prompt-minimization.ts#L11-L19)). Current guest templates omit the stored family-name field ([src/agent/run-task.ts:1193-1212](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/run-task.ts#L1193-L1212)), but host capture retains raw invitation text ([src/agent/run-task.ts:1188](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/run-task.ts#L1188)). The wrapper performs specific pattern replacements, not general name detection; free text and tool content can contain names.

`ScriptedModel` also extends `Model` and yields the SDK's own stream event classes so the agent loop cannot tell it from a real provider ([src/agent/scripted-model.ts:34-87](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/scripted-model.ts#L34-L87)):

```ts
yield new ModelContentBlockStartEvent({
  type: "modelContentBlockStartEvent",
  start: {
    type: "toolUseStart",
    name: step.toolUse.name,
    toolUseId: `scripted-${this.index}`,
  },
});
```

`TaskScriptedModel` picks the next step by reading the latest `toolResultBlock` from the SDK `Message` history ([src/agent/scripted-model-selection.ts:33-64](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/scripted-model-selection.ts#L33-L64), `257-278`). It is selected when `MODEL=scripted` ([src/agent/runtime/deps.ts:30-32](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/runtime/deps.ts#L30-L32)).

**Why it matters.** The interrupt-and-resume test, the telemetry test, the browser tests, and the demo driver all run the real `Agent`, the real hooks, and the real session storage with no model call. The scripted model produces tool calls, so the policy hook, interrupts, and the audit trail are exercised in CI exactly as in production.

**Files.** `src/agent/agent.ts`, `src/agent/prompt-minimization.ts`, `src/agent/scripted-model.ts`, `src/agent/scripted-model-selection.ts`, `src/agent/runtime/deps.ts`.

---

## 3. Typed tools with `tool()` and zod

**The feature.** `tool()` takes a name, a description, a zod `inputSchema`, and a callback. The SDK validates the model's input against the schema before the callback runs and passes a `context` with `invocationState`.

**How L'Ayalga uses it.** The authored tools below are selected by task scope, each in its own module under `src/agent/tools/`. Every one is a function of `deps` so the callback closes over the database, the clock, and the task authority.

| Tool                    | Description given to the model                                                                                                                         | File                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------- |
| `capture_invitation`    | Structure a host's invitation, create or reuse the invited party, and return the private guest link.                                                   | `capture-invitation.ts`    |
| `find_visit_options`    | Find candidate stays in a date window and report capacity plus anonymous overlap details without naming another party.                                 | `find-visit-options.ts`    |
| `evaluate_overlap`      | Check beds, children, pets, and special-request policy for a proposed stay without changing a booking.                                                 | `evaluate-overlap.ts`      |
| `create_temporary_hold` | Place a temporary 48-hour hold on rooms for a party and stay. Policy runs before this tool; execution means the stay is allowed or a host approved it. | `create-temporary-hold.ts` |
| `confirm_visit`         | Confirm an existing temporary hold after current overlap policy allows it or a host approves it.                                                       | `confirm-visit.ts`         |
| `reschedule_visit`      | Move an existing visit to new dates and reallocate rooms. Policy runs first and a changed approved stay may require a new host decision.               | `reschedule-visit.ts`      |
| `notify`                | Write one bilingual in-app notification for a host or invited party. Always supply complete English and Spanish bodies.                                | `notify.ts`                |
| `list_guest_rooms`      | List bounded guest-safe active room inventory, including rooms withheld by default. Results contain no private room notes or calendar capabilities.    | `list-guest-rooms.ts`      |
| `find_room_options`     | Recommend guest-safe rooms for an exact stay and party size. Overflow recommendations are marked for guest consent and host approval.                  | `find-room-options.ts`     |
| `prepare_room_action`   | Prepare one pending private block, room opening, or room closure for visible host review. This never applies the room change.                          | `prepare-room-action.ts`   |

The `capture_invitation` description above is the checked-in tool description. Its callback returns invitation and party IDs, while the application reveals the private link separately ([src/agent/tools/capture-invitation.ts:96-99](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/tools/capture-invitation.ts#L96-L99)).

Schemas carry hard bounds from `src/agent/task-limits.ts`, for example ([src/agent/tools/capture-invitation.ts:28-33](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/tools/capture-invitation.ts#L28-L33)):

```ts
inputSchema: z.object({
  partyName: z.string().min(1).max(MAX_PARTY_NAME_LENGTH),
  partyLocale: z.enum(["en", "es"]),
  adults: z.int().min(1).max(MAX_ADULTS),
  children: z.int().min(0).max(MAX_CHILDREN).default(0),
  pets: z.int().min(0).max(MAX_PETS).default(0),
```

`find_visit_options` uses zod refinements to cap the search window at ninety days ([src/agent/tools/find-visit-options.ts:20-32](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/tools/find-visit-options.ts#L20-L32)).

**Scoping per task.** `buildTools` gives a `host_room_request` only the three room tools and every other task the seven booking tools at this baseline ([src/agent/deps.ts:20-37](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/deps.ts#L20-L37)). When a memory store applies, the SDK adds its own `search_memory` tool (section 7).

**Trusted inputs.** The model does not get to assert the facts that matter. Before a gated tool runs, the policy hook rewrites its input from server-side state ([src/agent/tools/shared.ts:88-91](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/tools/shared.ts#L88-L91)):

```ts
const sanitizedInput = { ...input };
delete sanitizedInput.approvedBy;
delete sanitizedInput.roomIds;
delete sanitizedInput.overflowConsent;
```

For `create_temporary_hold`, the stay, party size, special requests, room choice, and overflow consent all come from the guest's own submission, held in `deps.authority.guestSubmission`, not from the model ([src/agent/tools/shared.ts:92-108](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/tools/shared.ts#L92-L108), [src/agent/tools/create-temporary-hold.ts:41-48](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/tools/create-temporary-hold.ts#L41-L48)). `approvedBy` is set only by the hook after a host approval (section 4).

**Authority checks.** Every callback resolves the home through `requireAuthority`, `homeIdForInvitation`, or `homeIdForVisit`, which throw when a record is outside the task's home or outside the one invitation or visit the task is scoped to ([src/agent/tools/shared.ts:29-75](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/tools/shared.ts#L29-L75)). `notify` also enforces deterministically that a party may only ever receive a `reconfirm_chase` ([src/agent/tools/notify.ts:129-138](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/tools/notify.ts#L129-L138)).

**`invocationState`.** Every tool audits itself with the run id the SDK threads through `context.invocationState` ([src/agent/tools/shared.ts:19-22](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/tools/shared.ts#L19-L22)). `prepare_room_action` refuses to run without it ([src/agent/tools/prepare-room-action.ts:30-35](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/tools/prepare-room-action.ts#L30-L35)).

**Bounded outputs.** Room tools truncate labels and arrangements before returning them to the model ([src/agent/tools/room-output.ts:9-19](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/tools/room-output.ts#L9-L19)).

**Why it matters.** The model interprets language and chooses a tool. Zod bounds the shape, the hook replaces the sensitive fields, and the callback checks the tenant. Nothing the model writes reaches booking state unchecked.

**Files.** `src/agent/tools/*.ts`, `src/agent/deps.ts`, `src/agent/task-limits.ts`, `src/agent/schemas.ts`.

---

## 4. Hooks: `BeforeToolCallEvent` and `AfterToolCallEvent`

**The feature.** `agent.addHook(EventClass, callback)` registers a callback on the agent loop. `BeforeToolCallEvent` fires after tool lookup and before execution; a callback may set `event.cancel`, mutate `event.toolUse`, or call `event.interrupt()`. `AfterToolCallEvent` fires after execution and exposes `event.error`.

**How L'Ayalga uses it.** The policy hook gates three tools ([src/agent/policy-hook.ts:22-26](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/policy-hook.ts#L22-L26)) and is installed on every agent ([src/agent/agent.ts:69](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/agent.ts#L69)). It runs in this order ([src/agent/policy-hook.ts:38-127](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/policy-hook.ts#L38-L127)):

1. Load the draft from server state and replace the model's input: `event.toolUse.input = sanitizedInput` (line 43).
2. Evaluate room selection and overlap policy in deterministic code (lines 44-59).
3. Write a `policy_verdict` audit row with the run id from `event.invocationState` (lines 64-68).
4. On deny, set `event.cancel` to a message the model can relay (lines 70-77):

   ```ts
   if (verdict.decision === "deny") {
     event.cancel = denyMessage(verdict);
     return;
   }
   ```

5. On interrupt, call `event.interrupt<HostDecision>(...)` (section 5). When the SDK returns a response, re-evaluate policy against fresh state, cancel if the house changed while the host was deciding, and only then stamp `approvedBy` (lines 95-126):

```ts
event.toolUse.input = { ...sanitizedInput, approvedBy: response.hostId };
```

A second hook audits the SDK's own `search_memory` tool, which none of the project's tool modules can see ([src/agent/memory.ts:141-148](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/memory.ts#L141-L148)):

```ts
agent.addHook(AfterToolCallEvent, async (event) => {
  if (event.toolUse.name !== "search_memory" || event.error) return;
  const homeId = deps.authority?.homeId;
  if (!homeId) return;
  await audit(deps, homeId, event, "tool_call", { name: "search_memory" });
});
```

**Why it matters.** The system prompt tells the model it never decides whether a host must be asked ([src/agent/system-prompt.ts:2](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/system-prompt.ts#L2)). The hook is where that promise is enforced. The model cannot skip it, cannot pass its own `approvedBy`, and sees only a cancel message or a completed tool result.

**Files.** `src/agent/policy-hook.ts`, `src/agent/memory.ts`, `src/agent/policy-hook-refresh.test.ts`, `src/agent/memory-search-audit.test.ts`.

---

## 5. Interrupts and resume

**The feature.** `event.interrupt<T>({ name, reason })` throws out of the agent loop with `stopReason: "interrupt"` and a list of `result.interrupts`. A later `invoke()` on the same session, passed `InterruptResponseContent` values, replays the pending tool call and returns the response from the same `interrupt()` call site.

**How L'Ayalga uses it.** The hook raises the interrupt with a typed response and a structured reason ([src/agent/policy-hook.ts:82-97](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/policy-hook.ts#L82-L97)):

```ts
const response = event.interrupt<HostDecision>({
  name: "host_decision",
  reason: (overflowInterrupt
    ? hostOverflowDecisionReason(
        draft,
        selection.rooms,
        selection.overflowArrangements,
      )
    : hostDecisionReason(
        draft,
        verdict as Extract<PolicyVerdict, { decision: "interrupt" }>,
      )) as unknown as JSONValue,
});
if (!response.approved) {
  event.cancel = `Declined by host${response.note ? `: ${response.note}` : ""}`;
  return;
}
```

The reason carries the requested draft and a `stayApprovalHash` ([src/agent/host-decision-context.ts:21-47](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/host-decision-context.ts#L21-L47)). The host UI never trusts that JSON blindly: `verifiedHostDecisionContext` re-validates every field and recomputes the hash before showing the decision ([src/agent/host-decision-context.ts:50-118](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/host-decision-context.ts#L50-L118)).

The run loop persists the interrupt ([src/agent/run-task.ts:405-437](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/run-task.ts#L405-L437)): each entry of `result.interrupts` becomes a `pending_decisions` row keyed by session id and interrupt id, and the run is marked `interrupted`.

A `resume` task carries the host's responses ([src/agent/task.ts:66-85](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/task.ts#L66-L85)). Before the agent is built, the run checks each decision was recorded by that host with that note ([src/agent/run-task.ts:329-355](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/run-task.ts#L329-L355)) and claims it with `applied_run_id` (lines 356-369). The invoke input is then a list of SDK response objects ([src/agent/run-task.ts:379-385](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/run-task.ts#L379-L385)):

```ts
const invokeArgs =
  task.task === "resume"
    ? task.responses.map(
        ({ interruptId, response }) =>
          new InterruptResponseContent({ interruptId, response }),
      )
    : await buildPrompt(task, deps);
```

**Decision application and replay.** On completion the run writes a `decision_applied` audit row guarded by a not-exists check ([src/agent/run-task.ts:439-467](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/run-task.ts#L439-L467)). On failure it releases `applied_run_id` only when that row was never written (lines 498-516), allowing a failed application to be retried while guarding a recorded application. If a resumed stay still matches the approval hash, the hook does not interrupt again ([src/agent/policy-hook.ts:80](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/policy-hook.ts#L80)).

**Test.** `src/agent/interrupt-resume.test.ts` runs a `guest_submit` that interrupts, records the approval, then resumes in a separate Node process (`execFileSync` of `src/agent/test-support/resume-child.ts`, lines 111-129), and asserts one `create_temporary_hold` audit row and one `decision_applied` row (lines 138-151). The declined path asserts no visit was created (lines 163-208). These tests cover specific approved and declined paths; they do not establish an exactly-once guarantee for every crash or provider failure.

**Why it matters.** A host decides hours later, on a phone, in another request, possibly on another AgentCore container. The SDK interrupt carries the pending tool call across that gap, and the database makes the application of the decision idempotent.

**Files.** `src/agent/policy-hook.ts`, `src/agent/host-decision-context.ts`, `src/agent/run-task.ts`, `src/agent/interrupt-resume.test.ts`.

---

## 6. Session management over Postgres

**The feature.** `SessionManager` snapshots the agent's messages and state through a `Storage` interface (`read`, `write`, `delete`, `list`, `namespace`) and restores them on the next `Agent` with the same `sessionId`. `saveLatestOn` selects when the snapshot is written.

**How L'Ayalga uses it.** `PostgresStorage` implements `Storage` over the `agent_sessions` table ([src/agent/storage/postgres-storage.ts:23-87](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/storage/postgres-storage.ts#L23-L87)):

```ts
async write(key: string, data: Uint8Array): Promise<void> {
  const fullKey = this.key(key);
  await this.sql`
    insert into public.agent_sessions (key, session_id, data)
    values (${fullKey}, ${this.sessionId}, ${data})
    on conflict (key) do update
    set
      session_id = excluded.session_id,
      data = excluded.data,
      updated_at = now()
```

Keys are normalized and `..` is rejected (lines 5-16); `list` escapes `LIKE` wildcards (lines 19-21, 61-75). `namespace("session")` returns a prefixed view (lines 77-81), which is how `buildAgent` mounts it ([src/agent/agent.ts:47-53](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/agent.ts#L47-L53)). `saveLatestOn: "message"` writes after every message, so an interrupt is on disk before the process returns.

**Session ids.** `resolveSessionId` derives a stable id per conversation ([src/agent/run-task.ts:902-921](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/run-task.ts#L902-L921)): `inv_<invitationId>` for every guest task on one invitation, `tick_<jobId>`, `capture_<hostId>`, `room_<hostId>`, and the original id for `resume`. The SDK validates ids with `/^[a-z0-9_-]+$/` (`node_modules/@strands-agents/sdk/dist/src/session/validation.js:10`). ADR 0002 records why the planned `inv:` prefix became `inv_` ([docs/decisions/0002-agent-runtime.md:20](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/docs/decisions/0002-agent-runtime.md#L20)). The same id is reused as the AgentCore Memory session id (section 7).

**Test.** `src/agent/storage/postgres-storage.test.ts` covers write, read, list, delete, and namespacing against a real database.

**Why it matters.** The database is the only state shared between the Vercel process that accepts a request and the AgentCore container that runs it. A session in Postgres is what lets `resume` continue a conversation that a different runtime started.

**Files.** `src/agent/storage/postgres-storage.ts`, `src/agent/agent.ts`, `src/agent/run-task.ts`, `docs/decisions/0002-agent-runtime.md`.

---

## 7. `MemoryManager` over AgentCore Memory

**The feature.** `MemoryManager` takes one or more `MemoryStore`s, exposes `search_memory` and optionally `add_memory` as tools, can inject recalled context before each model call, and can extract long-term records from the conversation through an `ExtractionTrigger`. `bedrock-agentcore` ships `AgentCoreMemoryStore`, a `MemoryStore` over Amazon Bedrock AgentCore Memory.

**How L'Ayalga uses it.** `memoryStoresForTask` decides per task which store applies and whether it may write ([src/agent/memory.ts:53-100](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/memory.ts#L53-L100)):

```ts
const writable = task === "guest_submit" || task === "guest_change";
return [
  new AgentCoreMemoryStore({
    memoryId,
    region,
    actorId,
    sessionId,
    namespacePath: `/parties/${actorId}`,
    name: "family",
    writable,
    extraction: writable ? { trigger: new InvocationTrigger() } : false,
```

with `maxSearchResults: 5`. The topology:

| Task                                                   | Store                                      | Writable | Extraction          |
| ------------------------------------------------------ | ------------------------------------------ | -------- | ------------------- |
| `host_room_request`                                    | none                                       |          |                     |
| `host_capture`, no party matched in the message        | household subtree `/parties/home-<homeId>` | no       | no                  |
| `host_capture`, party matched                          | party subtree                              | no       | no                  |
| `guest_submit`, `guest_change`                         | party subtree                              | yes      | `InvocationTrigger` |
| `guest_reconfirm`, `tick`, `resume` on a party session | party subtree                              | no       | no                  |

The actor id is `home-<homeId>` or `home-<homeId>/party-<partyId>`, so one party can never read another party's records ([src/agent/memory.ts:65-68](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/memory.ts#L65-L68), `82`).

`memoryConfigForTask` fixes the manager options ([src/agent/memory.ts:122-127](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/memory.ts#L122-L127)):

```ts
return {
  stores,
  searchToolConfig: { description: SEARCH_MEMORY_DESCRIPTION },
  addToolConfig: false,
  injection: false,
};
```

`injection: false` keeps recall tool-driven, so the prompt shapes the minimizer expects stay intact. `addToolConfig: false` means the model has no direct write path. The `search_memory` description is the project's own ([src/agent/memory.ts:22-23](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/memory.ts#L22-L23)).

**Extraction boundary.** `InvocationTrigger` reads the whole conversation. A `host_capture` conversation contains the host's raw message, which names the family, so that task is never extraction-backed ([src/agent/memory.ts:37-46](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/memory.ts#L37-L46)). The one write path for what a capture teaches the house is `recordCaptureMemory`, which calls AgentCore `CreateEvent` directly with a facts-only event that omits the `partyName` field and uses `clientToken: runId` so a retried run never double-writes ([src/agent/record-capture-memory.ts:27-71](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/record-capture-memory.ts#L27-L71)).

**Flush.** Extraction runs in the background. At the end of every invoke the run calls `agent.memoryManager?.flush()` inside a guard that logs and swallows failure, because a memory write must never fail the booking run it rides with ([src/agent/run-task.ts:62-73](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/run-task.ts#L62-L73), `403`).

**Prompt steers.** When memory is on, the prompt asks the model to call `search_memory` first and states that recalled facts never change party size, dates, or special requests ([src/agent/run-task.ts:1127-1128](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/run-task.ts#L1127-L1128)). `capture_invitation` enforces that deterministically: a special request that merely restates a `rememberedContext` entry is dropped ([src/agent/tools/capture-invitation.ts:62-73](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/tools/capture-invitation.ts#L62-L73)).

**Why it matters.** The house can recall arrival habits, pets, and room needs across visits within party scopes. Omitting the family-name field and disabling capture extraction reduce identity exposure; free-text dates, requests, guest messages, and tool content are not guaranteed anonymous ([src/agent/record-capture-memory.ts:89](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/record-capture-memory.ts#L89), [src/agent/run-task.ts:1209](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/run-task.ts#L1209)).

**Files.** `src/agent/memory.ts`, `src/agent/record-capture-memory.ts`, `src/agent/run-task.ts`, `src/agent/memory.test.ts`, `src/agent/memory-capture-safety.test.ts`, `src/agent/memory-flush-safety.test.ts`.

---

## 8. Observability: `traceAttributes` and Strands spans

**The feature.** `Agent` reads the global OpenTelemetry tracer at construction and emits spans for the agent invocation, each model call, each tool call, and each memory search. `traceAttributes` are attached to the agent span.

**How L'Ayalga uses it.** The agent span carries ids only ([src/agent/agent.ts:59-63](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/agent.ts#L59-L63)):

```ts
traceAttributes: {
  "layalga.home_id": homeId,
  "layalga.task": task,
  "session.id": sessionId,
},
```

Span names come from the SDK: `invoke_agent <agent name>` (`node_modules/@strands-agents/sdk/dist/src/telemetry/tracer.js:200`), `chat` with `gen_ai.request.model` for each model call (line 279-281), `execute_tool <tool name>` with `gen_ai.tool.name` (line 345), and `memory.search` (line 548).

**Test.** `src/agent/telemetry.test.ts` registers a `NodeTracerProvider` with an in-memory exporter before `buildAgent` runs, then asserts the `invoke_agent` span carries the three attributes and the `execute_tool` span names `capture_invitation` (lines 30-47, 77-99). The test proves Strands emits under any registered provider; ADOT only registers one in the deployed runtime.

**Deployment.** `scripts/deploy-agentcore.sh` merges tracing defaults into the runtime environment (lines 123-128):

```bash
otel_defaults='{
  "NODE_OPTIONS": "--require @aws/aws-distro-opentelemetry-node-autoinstrumentation/register",
  "OTEL_SERVICE_NAME": "layalga-agent",
  "OTEL_SEMCONV_STABILITY_OPT_IN": "gen_ai_latest_experimental",
  "OTEL_TRACES_SAMPLER": "parentbased_always_on"
}'
```

ADR 0002's tracing addendum records the resulting X-Ray trace with the `invoke_agent Strands Agent` span and two Bedrock calls; the screenshot is `docs/submission/assets/agentcore-trace.png`.

**Why it matters.** A judge or an operator can open one trace and see the task, the home, the model call, and every tool call, with only IDs in the application-added trace attributes. SDK spans may additionally contain conversation and tool text; the [data lifecycle](../security/data-lifecycle.md#tracing-spans-and-cloudwatch-retention) explains that separate boundary.

**Files.** `src/agent/agent.ts`, `src/agent/telemetry.test.ts`, `scripts/deploy-agentcore.sh`, `docs/decisions/0002-agent-runtime.md`.

---

## 9. Runtime: `BedrockAgentCoreApp` and bounded invocation

**The feature.** `BedrockAgentCoreApp` from `bedrock-agentcore` serves the AgentCore Runtime HTTP contract and keeps the container alive while `addAsyncTask` work is outstanding. On the Strands side, `agent.invoke(input, { invocationState, cancelSignal })` threads a per-run state object to tools and hooks and aborts on a signal.

**How L'Ayalga uses it.** The AgentCore entrypoint is seventeen lines ([src/agent/runtime/agentcore.ts:5-17](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/runtime/agentcore.ts#L5-L17)):

```ts
export const agentCoreApp: BedrockAgentCoreApp = new BedrockAgentCoreApp({
  invocationHandler: {
    process: (request, context) =>
      handleAgentCoreRequest(request, context.log, {
        addAsyncTask: (name) => agentCoreApp.addAsyncTask(name),
        completeAsyncTask: (taskId) => {
          agentCoreApp.completeAsyncTask(taskId);
        },
      }),
  },
});
```

`handleAgentCoreRequest` accepts three envelopes ([src/agent/runtime/handler.ts:45-127](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/runtime/handler.ts#L45-L127)): `execute_run` for a run the web side already queued, `scheduled_tick` from EventBridge Scheduler, and a bare task that is awaited. For `execute_run`, `acceptAgentRunExecution` registers an async task, starts the run in the background, and returns `{ status: "accepted", runId }` immediately ([src/agent/runtime/async-execution.ts:21-35](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/runtime/async-execution.ts#L21-L35)). The web client treats that acknowledgement as accepted work, not a result, and the terminal state is read from the run row ([src/agent/client.ts:64-78](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/client.ts#L64-L78)).

Every invoke is bounded ([src/agent/run-task.ts:390-396](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/run-task.ts#L390-L396)):

```ts
const result = await agent.invoke(invokeArgs, {
  invocationState: { runId: run.id },
  cancelSignal: AbortSignal.timeout(240_000),
});
if (result.stopReason === "cancelled") {
  throw new Error("Agent execution budget exceeded");
}
```

The four-minute budget matches the run's claim deadline ([src/agent/run-task.ts:563](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/run-task.ts#L563)), so a cancelled invoke and a lease that expires are the same event to the queue. `invocationState.runId` is what every tool and the policy hook use to audit against the right run (section 3).

**Why it matters.** The same `runAgentTask` runs locally under Vercel `after()` and on AgentCore. The runtime adapter only decides who awaits.

**Files.** `src/agent/runtime/agentcore.ts`, `src/agent/runtime/handler.ts`, `src/agent/runtime/async-execution.ts`, `src/agent/run-task.ts`, `src/agent/client.ts`.

---

## 10. What is deliberately not handed to the SDK

The SDK runs the model loop. Everything with consequences stays in deterministic code and PostgreSQL.

- **Booking state.** Tools call `src/core/booking/*` functions; the model never writes a row. The room choice, overflow consent, and approver id are stripped from tool input and re-supplied from server state ([src/agent/tools/shared.ts:88-108](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/tools/shared.ts#L88-L108)).
- **Policy decisions.** `evaluateOverlap` and `evaluateRoomSelection` in `src/core/policy` and `src/core/rooms` decide allow, interrupt, or deny. The hook applies the verdict; the system prompt tells the model it does not ([src/agent/system-prompt.ts:2](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/system-prompt.ts#L2), [src/agent/policy-hook.ts:53-59](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/policy-hook.ts#L53-L59)).
- **Approval.** A host decision lives in `pending_decisions`, is recorded through the host UI, and a resume verifies the recorded status, host, and note before the SDK ever sees the response ([src/agent/run-task.ts:329-355](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/run-task.ts#L329-L355)).
- **Notification delivery.** The tick agent is asked to call `notify`, but the guarantee belongs to the job engine. If the run ends without every required notification, `deliverRequiredNotifications` writes them from the same bilingual templates and records a `notification_fallback` audit event ([src/core/reconfirmation/jobs.ts:347-357](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/core/reconfirmation/jobs.ts#L347-L357), `377`, `445-460`).
- **Queueing, retries, and idempotency.** Runs are rows in `runs` with an intent key, a claim token, a heartbeat, and a deadline; a cron drain claims stale leases ([src/agent/run-task.ts:556-592](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/run-task.ts#L556-L592), [src/agent/queue.ts:23-97](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/queue.ts#L23-L97)). The SDK's own background tasks are not used for durability.
- **Memory writes for captures.** `add_memory` is off and `host_capture` has no writable store; the one capture write is a direct `CreateEvent` that omits `partyName` (section 7).
- **Identity minimization.** Guest templates omit the stored family-name field, the model wrapper replaces specific legacy shapes, and application-added trace attributes hold IDs. Raw capture/change text, tool content, and SDK span content can still contain names ([src/agent/run-task.ts:1188](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/run-task.ts#L1188), `:1209`, [src/agent/prompt-minimization.ts:11](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/prompt-minimization.ts#L11), [src/agent/agent.ts:57-63](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/agent.ts#L57-L63)).
- **Tenant boundaries.** Every tool re-checks the home and, where scoped, the single invitation or visit of the task ([src/agent/tools/shared.ts:29-75](https://github.com/juan294/layalga/blob/bf5041601b8910f92e632034c4c21b644dc6a3a9/src/agent/tools/shared.ts#L29-L75)); the AgentCore runtime connects as a non-owner database role (ADR 0002).

---

## Summary table

| SDK feature                             | Where                                                        | Purpose                                                          |
| --------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------- |
| `Agent` with full option set            | `src/agent/agent.ts`                                         | One agent construction path across task, test, and runtime modes |
| `BedrockModel`                          | `src/agent/agent.ts`                                         | Claude Sonnet 4.6 selected in the recorded configuration         |
| `Model` subclass, prompt wrapper        | `src/agent/prompt-minimization.ts`                           | Strip names from older prompt shapes before any provider call    |
| `Model` subclass, scripted              | `src/agent/scripted-model.ts`, `scripted-model-selection.ts` | Deterministic tool calls for CI and the demo                     |
| `tool()` with zod schemas               | `src/agent/tools/*.ts`                                       | Task-scoped, bounded, tenant-checked tools                       |
| Per-task tool lists                     | `src/agent/deps.ts`                                          | Room requests never see booking tools                            |
| `context.invocationState`               | `src/agent/tools/shared.ts`, `prepare-room-action.ts`        | Run id on every audit row                                        |
| `BeforeToolCallEvent` hook              | `src/agent/policy-hook.ts`                                   | Rewrite input, deny with `cancel`, or interrupt for a host       |
| `AfterToolCallEvent` hook               | `src/agent/memory.ts`                                        | Audit the SDK's `search_memory` tool                             |
| `event.interrupt<T>`                    | `src/agent/policy-hook.ts`                                   | Typed host decision with a hashed reason                         |
| `stopReason: "interrupt"`               | `src/agent/run-task.ts`                                      | Persist pending decisions and mark the run interrupted           |
| `InterruptResponseContent`              | `src/agent/run-task.ts`                                      | Resume with verified responses and recorded application          |
| `SessionManager`, `saveLatestOn`        | `src/agent/agent.ts`                                         | Snapshot after every message                                     |
| Custom `Storage`                        | `src/agent/storage/postgres-storage.ts`                      | Sessions in Postgres, shared by Vercel and AgentCore             |
| `MemoryManager`, `AgentCoreMemoryStore` | `src/agent/memory.ts`                                        | Per-party household memory, read-only or writable by task        |
| `InvocationTrigger`                     | `src/agent/memory.ts`                                        | Extraction only on guest tasks, never on captures                |
| `memoryManager.flush()`                 | `src/agent/run-task.ts`                                      | Drain buffered turns at the run boundary, never failing the run  |
| `traceAttributes`                       | `src/agent/agent.ts`                                         | Task, home, and session ids on the `invoke_agent` span           |
| `invoke` with `cancelSignal`            | `src/agent/run-task.ts`                                      | Four-minute budget aligned with the queue lease                  |
| `BedrockAgentCoreApp`, async tasks      | `src/agent/runtime/agentcore.ts`, `handler.ts`               | Accept a queued run, keep the container alive until it finishes  |
| `toolExecutor: "sequential"`            | `src/agent/agent.ts`                                         | One gated call at a time against current database state          |
| `printer: false`                        | `src/agent/agent.ts`                                         | No console rendering in a server process                         |
