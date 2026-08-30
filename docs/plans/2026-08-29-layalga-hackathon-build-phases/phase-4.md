# Phase 4: Reconfirmation, injectable clock, EventBridge Scheduler `[batch-eligible]`

Days: 2026-09-06 to 2026-09-07, in parallel with Phase 3. Owns
`src/core/reconfirmation/**`, `src/core/clock.ts` (extension only),
`src/agent/scheduler/**`, `src/agent/runtime/**` (tick handling),
`src/app/api/ticks/route.ts`, `src/app/api/demo/**`, `infra/**`. Depends on
Phase 2. Authorization: D3.

## Goal

Proactive follow-through: T-3 chase, 24-hour escalation, driven by the
authoritative `scheduled_jobs` table, triggered in production by EventBridge
Scheduler and in the demo by the labeled clock; success criterion 5 green;
one real schedule observed firing.

## Tasks

- [x] 4.1 `src/core/reconfirmation/state-machine.ts` per the plan's section 10: `planChase(visit, tz)`, `applyChase(visit, now)`, `applyGuestAnswer(visit, answer, now)`, `applyEscalation(visit, now)`, all pure, returning the next visit state and the job operations (`create`, `cancel`).
- [x] 4.2 `src/core/reconfirmation/jobs.ts`: `scheduleJobs(db, scheduler, ops)`, `runDueJobs(db, clock, agentInvoker, homeId?)` (select `scheduled` jobs with `due_at <= clock.now()` `FOR UPDATE SKIP LOCKED`, mark `running`, execute, mark `done`; idempotent on retries), `runJob(jobId)`.
- [x] 4.3 `src/agent/scheduler/index.ts`: `interface Scheduler { schedule(job): Promise<string | null>; cancel(ref): Promise<void> }`; `EventBridgeScheduler` (`@aws-sdk/client-scheduler` `CreateScheduleCommand` with `ScheduleExpression at(<UTC ISO without Z>)`, `ScheduleExpressionTimezone 'UTC'`, `FlexibleTimeWindow { Mode: 'OFF' }`, `ActionAfterCompletion 'DELETE'`, target `Arn 'arn:aws:scheduler:::aws-sdk:bedrockagentcore:invokeAgentRuntime'`, `RoleArn SCHEDULER_ROLE_ARN`, `Input JSON { AgentRuntimeArn, Qualifier: 'DEFAULT', ContentType: 'application/json', Payload: JSON.stringify({ task: 'tick', homeId, jobId }) }`, `RetryPolicy { MaximumRetryAttempts: 2 }`, `DeadLetterConfig { Arn: SCHEDULER_DLQ_ARN }`, name `layalga-<kind>-<jobId>`), `NoopScheduler` (demo homes, tests). Selected by `SCHEDULER` env and by `homes.demo`.
- [x] 4.4 Infra by CLI, idempotent script `scripts/infra-scheduler.sh`: SQS queue `layalga-scheduler-dlq`; IAM role `layalga-scheduler-invoke` (trust `scheduler.amazonaws.com`, policy `bedrock-agentcore:InvokeAgentRuntime` on the runtime ARN and `<arn>/*`, `sqs:SendMessage` on the DLQ). Policies as JSON in `infra/iam/`. Skipped if Phase 0 verdict was `local`.
- [x] 4.5 Tick handling in `src/agent/runtime/agentcore.ts`: on `task: 'tick'` validate, `const id = app.addAsyncTask('tick')`, `void runJob(jobId).finally(() => app.completeAsyncTask(id))`, return `{ status: 'accepted', jobId }` immediately. Keep a module-level `Set` of in-flight promises.
- [x] 4.6 `src/app/api/ticks/route.ts` (GET, auth by `TICK_SECRET` header or Vercel Cron header): `runDueJobs` for all homes; wired in `vercel.json` `crons` `* * * * *` only when `AGENT_RUNTIME=local` is the production verdict (the `crons` entry is added in Phase 5 in that case).
- [x] 4.7 `src/app/api/demo/clock/route.ts` (POST `{ homeId, now }`): requires `DEMO_MODE` and a demo home; updates `demo_clock`; then `runDueJobs(db, DbDemoClock(homeId), invoker, homeId)`; returns the jobs run and the resulting notifications. `src/app/api/demo/reset/route.ts`: re-seeds the demo home, clears `agent_sessions` keys for its sessions, resets the clock to the seed value.
- [x] 4.8 Guest reconfirm: `applyGuestAnswer` wired to the guest page's "Yes" button (deterministic, no agent) and to `guest_reconfirm` with `answer 'change'` (agent).
- [x] 4.9 Criterion 5 test `src/core/reconfirmation/state-machine.test.ts` with `FakeClock` (protocol below) and an integration test `jobs.test.ts` running `runDueJobs` with `NoopScheduler` and a `ScriptedModel` agent, asserting the `notifications` rows.
- [x] 4.10 Real schedule proof (only if verdict `agentcore`): `scripts/scheduler-probe.ts` creates a visit on a non-demo probe home with `SCHEDULER=eventbridge`, forces the chase `due_at` to now plus 2 minutes, waits, asserts `scheduled_jobs.status = 'done'`, a `notifications` row exists, the schedule was deleted, and the DLQ depth is 0. Output pasted into the phase notes.

## Criterion 5 protocol

```
clock = new FakeClock('2026-09-07T10:00+02:00'); visit Vega confirmed 09-18 to 09-21
ops = planChase(visit, 'Europe/Madrid') -> one job reconfirm_chase due 2026-09-15T09:00+02:00
clock.set('2026-09-15T09:00+02:00'); run due -> visit.status 'reconfirm_pending', notify(party, 'reconfirm_chase'), job reconfirm_escalate due 2026-09-16T09:00+02:00
branch A: clock.set('2026-09-16T09:05+02:00'); run due -> visit.status 'escalated', two notify(host) rows (Juan, Jordan), escalate job done
branch B: clock.set('2026-09-15T18:00+02:00'); applyGuestAnswer('yes') -> 'reconfirmed', escalate job cancelled; clock.set('2026-09-16T09:05+02:00'); run due -> no notifications, no status change
branch C: chase planned when now is already past T-3 -> job due now (immediate chase), then the same 24 h escalation
```

## Verification

Sequential: `pnpm run typecheck`, `pnpm run lint`, `pnpm run test`,
`pnpm run build`. Then `scripts/scheduler-probe.ts` once (agentcore verdict).

## Exit criteria

- Criterion 5 green.
- Demo clock endpoint drives beat 4 locally with `AGENT_RUNTIME=local` and
  the scripted model, then once with Bedrock.
- Real Scheduler firing observed once (agentcore verdict), DLQ empty.

STOP and wait for confirmation.
