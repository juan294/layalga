# Phase 2: Agent, tools, policy hook, interrupt and resume

Days: 2026-09-01 to 2026-09-05. Slices 2A and 2B are small enough for the
low-availability days; 2C and 2D land on 09-04 and 09-05.

## Goal

The Strands coordinator agent with seven typed tools, the deterministic
policy hook, Postgres-backed sessions, `runAgentTask`, both runtime hosts,
and success criteria 3 and 4 green.

## Slices and tasks

Slice 2A, test support and storage (09-01):

- [ ] 2.1 `src/agent/scripted-model.ts`: `class ScriptedModel extends Model` whose constructor takes `steps: ScriptStep[]`; each step is either `{ text }` (yields message start, one text delta, message stop with `stopReason 'endTurn'`) or `{ toolUse: { name, input } }` (yields `contentBlockStart { toolUseStart }`, a `toolUseInputDelta` with the JSON, block stop, message stop with `stopReason 'toolUse'`). `getConfig` returns `{ modelId: 'scripted' }`. Verified against `dist/src/models/streaming.d.ts` event classes.
- [ ] 2.2 `src/agent/storage/postgres-storage.test.ts`: write, read, list by prefix, delete, namespace round trip.

Slice 2B, tools (09-02 to 09-03):

- [ ] 2.3 `src/agent/tools/*.ts`, one file per tool, each `tool({ name, description, inputSchema, callback })` with callbacks delegating to `src/core` and writing `audit_events`. Tool descriptions are the only prompt-like text in the codebase besides the system prompt; write them in English.
- [ ] 2.4 `src/agent/deps.ts`: `AgentDeps = { db, clock, scheduler, appUrl, locale }` injected into tools through a factory `buildTools(deps)` so tests pass a `FakeClock` and a `NoopScheduler`.

Slice 2C, agent and hook (09-04):

- [ ] 2.5 `src/agent/policy-hook.ts` exactly as the plan's section 8, including `approvalCovers` (compares `visits.approval_stay_hash` with `hash(stay, adults, children, pets, specialRequests)`).
- [ ] 2.6 `src/agent/agent.ts`: `buildAgent({ sessionId, deps, model? })` with `BedrockModel` by default, `SessionManager({ sessionId, storage: new PostgresStorage(sql).namespace('session'), saveLatestOn: 'message' })`, `systemPrompt` from `src/agent/system-prompt.ts` (en and es variants), `printer: false`.
- [ ] 2.7 `src/agent/run-task.ts`: `runAgentTask(payload: AgentTask, deps): Promise<RunResult>` per the plan's section 8: validates with zod, inserts `runs`, builds the prompt for each task kind, invokes, on `stopReason === 'interrupt'` inserts `pending_decisions` and sets `runs.status = 'interrupted'`, on `resume` marks the decision rows `applied`, always finalizes `runs`.
- [ ] 2.8 `src/agent/runtime/local.ts` (`LocalAgentClient.run = runAgentTask`) and `src/agent/runtime/agentcore.ts` (`BedrockAgentCoreApp`, request schema `AgentTask`, `tick` tasks acknowledged immediately with `addAsyncTask`, other tasks awaited), `src/agent/client.ts` (`AgentCoreClient` using `InvokeAgentRuntimeCommand` with `runtimeSessionId = randomUUID()`, `contentType application/json`, parses JSON or SSE), `getAgentClient()` by `AGENT_RUNTIME`.
- [ ] 2.9 `scripts/build-agent-bundle.sh`: esbuild bundle of `src/agent/runtime/agentcore.ts` to `dist/agent/app.js` (format chosen in Phase 0), zip with a `package.json` declaring `engines.node ">=22"`.
- [ ] 2.10 `src/app/api/agent/run/route.ts`: `export const maxDuration = 300`; POST validates a shared secret header `x-layalga-internal` (`TICK_SECRET`) and calls `runAgentTask`. Used when `AGENT_RUNTIME=local`.

Slice 2D, criteria 3 and 4 (09-05):

- [ ] 2.11 `src/agent/interrupt-resume.test.ts` (criterion 3), protocol below.
- [ ] 2.12 `src/agent/reschedule.test.ts` (criterion 4), protocol below.
- [ ] 2.13 `scripts/agent-smoke.ts`: one real Bedrock run of `host_capture` with the Vega message, printing the structured invitation; run once locally and paste the output into the phase notes.

## Criterion 3 protocol (`interrupt-resume.test.ts`)

```
seed demo home; invitation I for the Oteros with special request
model = new ScriptedModel([
  { toolUse: { name: 'create_temporary_hold', input: { invitationId: I, stay: ['2026-09-19','2026-09-21'], adults: 2, pets: 1, specialRequests: ['wheelchair access'] } } },
  { text: 'Hold placed and awaiting confirmation.' },
])
r1 = await runAgentTask({ task: 'guest_submit', ... }, { ...deps, model })
expect(r1.status).toBe('interrupted')
pd = pending_decisions where run_id = r1.runId  -> one row, interrupt_name 'host_decision', reason.decision 'interrupt'
expect(visits.count()).toBe(0)
// process restart: child process runs the resume with its own ScriptedModel instance holding only the trailing text step
out = execFileSync('node', ['--import', 'tsx', 'src/agent/test-support/resume-child.ts', sessionId, pd.interrupt_id, JSON.stringify({ approved: true, hostId: nel })])
expect(JSON.parse(out).status).toBe('completed')
expect(visits where invitation_id = I).toHaveLength(1) and status 'hold' and approval_stay_hash set
expect(audit_events where kind = 'tool_call' and name = 'create_temporary_hold').toHaveLength(1)
// decline path in-process
r3 = runAgentTask(guest_submit for a second invitation with a request)
r4 = runAgentTask({ task: 'resume', responses: [{ interruptId, response: { approved: false, hostId, note: 'not this weekend' } }] })
expect(visits for that invitation).toHaveLength(0); expect last tool result to contain 'Declined by host'
```

The child process proves the snapshot round trip: it constructs a brand new
`Agent` from `agent_sessions` and never sees the parent's in-memory state.

## Criterion 4 protocol (`reschedule.test.ts`)

```
seed: Vega confirmed 09-18 to 09-21 (children); Oteros hold approved for 09-19 to 09-21 with approval_stay_hash
case A: guest_change for the Oteros to 09-26 to 09-28 (still has the special request)
  -> runAgentTask with ScriptedModel [{ toolUse: reschedule_visit ... }]
  -> expect status 'interrupted', new pending_decisions row, visit unchanged until resume
  -> resume approved -> visit stay updated, approval_stay_hash recomputed, old reconfirmation jobs cancelled, new chase job created
case B: a third party with 1 child holds 09-25 to 09-27; guest_change moves it to 09-19 to 09-21 (overlaps Vega's children)
  -> expect status 'completed' with the tool cancelled: tool result contains 'children', visit stay unchanged, no pending_decisions row
```

## Pseudocode: tools

```ts
export const createTemporaryHold = (deps) => tool({
  name: 'create_temporary_hold',
  description: 'Place a temporary 48-hour hold on rooms for a party and stay. Policy is enforced before this tool runs; if it runs, the hold is allowed or a host approved it.',
  inputSchema: z.object({
    invitationId: z.uuid(), stay: z.tuple([isoDate, isoDate]), adults: z.int().min(1),
    children: z.int().min(0).default(0), pets: z.int().min(0).default(0),
    arrivalTime: z.string().optional(), specialRequests: z.array(z.string()).default([]),
    approvedBy: z.uuid().optional(),           // set by the hook on approval
  }),
  callback: async (input, ctx) => {
    const visit = await holds.createTemporaryHold(deps.db, deps.clock, input)
    await audit(deps, ctx, 'tool_call', { name: 'create_temporary_hold', visitId: visit.id })
    return { visitId: visit.id, rooms: visit.rooms, holdExpiresAt: visit.holdExpiresAt }
  },
})
```

## Pseudocode: runAgentTask prompts

```
host_capture:  `${host.displayName} pasted this invitation (locale ${locale}): """${rawMessage}""". Structure it with capture_invitation and reply with the guest link and a one-line summary for the host.`
guest_submit:  `Party ${party.familyName} (invitation ${invitationId}) chose ${stay}, ${adults} adults, ${children} children, ${pets} pets, arrival ${arrivalTime}, notes: ${notes}. Place a hold, then confirm it, and tell the guest what happens next in their language.`
guest_change:  `Party ${family} asks to change visit ${visitId}: """${message}""". Use find_visit_options if dates are unclear, then reschedule_visit.`
guest_reconfirm(change): same as guest_change; (yes) handled deterministically, no agent run.
tick(chase):   `Visit ${visitId} for ${family} starts ${start}. Write the reconfirmation request to the party with notify (kind 'reconfirm_chase'); do not change the booking.`
tick(escalate):`Visit ${visitId} for ${family} was not reconfirmed within 24 hours. Tell both hosts with notify (kind 'reconfirm_escalation', one call per host) what is at stake and what they can do.`
```

## Verification

Sequential: `pnpm run typecheck`, `pnpm run lint`, `pnpm run test`,
`pnpm run build`, `pnpm run agent:bundle`. `scripts/agent-smoke.ts` once
against Bedrock.

## Exit criteria

- Criteria 3 and 4 green (they need the local Supabase stack, so they run in
  the CI integration job).
- The AgentCore bundle builds; if Phase 0 verdict was `agentcore`, the
  runtime is updated with the new bundle (`update-agent-runtime`) and the
  Phase 0 spike script, adapted to `AgentTask`, still passes.

STOP and wait for confirmation. Phases 3 and 4 may then run in parallel.
