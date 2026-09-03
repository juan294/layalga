# Notes: `2026-09-03-hackathon-final-stretch`

Implementation notes for the plan `2026-09-03-hackathon-final-stretch`. Deviations only; `/validate` reads this file.

## Deviations

### Phase 0

1. Bare tick execution on AgentCore
   - Plan said: task 0.3 pseudocode awaits `runJob` for a bare `{ task: "tick" }` request and returns `runResultForJob`.
   - Found: the production callers (`runDueJobs` from the demo clock route and the cron path) claim the job before invoking the runtime. A second `runJob` on AgentCore finds the job already running, returns `skipped`, and the agent never executes, so `deliveryIsComplete` throws.
   - Chose: every bare task, tick included, is awaited through `runAgentTask` with `executionRuntime: "agentcore"`. Only the `scheduled_tick` envelope claims through `runJob`, in the fire-and-forget branch. The dispatch lives in `src/agent/runtime/handler.ts`; `src/agent/runtime/agentcore.ts` is the thin bundle entry.
   - Why: the caller owns the job claim. A database-backed test in `src/agent/runtime/handler.test.ts` drives the real handler through a job claimed by `runDueJobs`.

2. Demo clock test shape
   - Plan said: a demo clock route test with an `AgentCoreClient` fake asserting notifications.
   - Found: the route inlines raw SQL tagged templates, the demo mutation lease, and authorization; mocking all of them made the test brittle.
   - Chose: a database-backed `runDueJobs` test with a real `AgentCoreClient` and a fake `invoke` in `src/agent/client.test.ts`, plus the handler test above.
   - Why: both tests exercise the same synchronous tick contract the route depends on, against the real database.

3. Smoke cleanup
   - Plan said: delete the smoke invitation through the existing demo reset.
   - Found: `resetDemoHome` deletes and reseeds the whole demo home, and `cleanupDemoArtifacts` in the release probes also sweeps both demo hosts' capture sessions and rotates party link tokens.
   - Chose: `cleanupTaggedRunArtifacts` in `scripts/release-helpers.ts` removes only rows tagged with the smoke marker; `scripts/agentcore-smoke.ts` calls it in `finally` and verifies zero remaining rows.
   - Why: a production smoke run must not disturb demo state that judges may be looking at.

4. Runtime identity source
   - Plan said: the AgentCore env sets `AGENT_EXECUTION_RUNTIME=agentcore` and `executedOn` is sourced from `deps.executionRuntime`.
   - Found: each entry point already knows which runtime it is.
   - Chose: `runtimeDeps(task, { executionRuntime })` is called with `"agentcore"` from the AgentCore handler and `"local"` from the local client; the default is `"local"`. The env variable is written to `.env.agentcore` for operators but no code reads it.
   - Why: a hard-coded value per entry point cannot drift from the deployment.

5. Scheduler script guard
   - Plan said: update the grep in `scripts/infra-scheduler.sh` so it no longer short-circuits.
   - Found: the guard matched ADR 0002 text that stays in the file for history.
   - Chose: removed the guard; the script now requires `AGENTCORE_RUNTIME_ARN` unconditionally.
   - Why: the ADR addendum records the runtime decision; the script should not parse prose.
