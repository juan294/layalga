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

4. Runtime identity source and the agent env profile
   - Plan said: the AgentCore env sets `AGENT_EXECUTION_RUNTIME=agentcore` and `executedOn` is sourced from `deps.executionRuntime`.
   - Found: each entry point already knows which runtime it is. Separately, the AgentCore container runs with `NODE_ENV=production`, so `parseServerEnvironment` applied the web app's production contract and rejected the runtime env with `AGENT_RUNTIME: Required`; it would next have demanded Supabase public keys and cron secrets the agent never uses.
   - Chose: `runtimeDeps(task, { executionRuntime })` is called with `"agentcore"` from the AgentCore handler and `"local"` from the local client. `AGENT_EXECUTION_RUNTIME=agentcore` selects an agent profile in `src/lib/server/env.ts` that validates only the agent contract (database URL, https app URL, link secret, model settings) and defaults `AGENT_RUNTIME` and `SCHEDULER`.
   - Why: a hard-coded value per entry point cannot drift from the deployment, and the runtime should validate the contract it actually depends on.

5. Runtime env contents
   - Plan said: the AgentCore env includes `CALENDAR_FEED_SECRET`.
   - Found: no agent code reads the calendar feed secret; only the web calendar route does. The link secret is required because the capture tool signs guest links that the web app verifies. Vercel never returns sensitive values, so the link secret cannot be copied from a `vercel env pull`.
   - Chose: `scripts/deploy-agentcore.sh` requires `DATABASE_URL`, `BEDROCK_MODEL_ID`, `AWS_REGION`, `MODEL`, `APP_URL`, and `LINK_TOKEN_SECRET`; the owner supplies the link secret out of band.
   - Why: a secret the runtime never reads should not be copied into it.

6. Scheduler script guard
   - Plan said: update the grep in `scripts/infra-scheduler.sh` so it no longer short-circuits.
   - Found: the guard matched ADR 0002 text that stays in the file for history.
   - Chose: removed the guard; the script now requires `AGENTCORE_RUNTIME_ARN` unconditionally.
   - Why: the ADR addendum records the runtime decision; the script should not parse prose.

7. Production gate findings and the release shape
   - Plan said: task 0.9 switches production and task 0.10 runs the probes once against the deployed commit.
   - Found: the first probe run exposed three production-only defects: the approved-hold path locked `homes` with `select ... for update`, which the agent role cannot do; the agent bundle had not been rebuilt from the candidate, so the web and agent identities diverged; and the tick agent under the real model sometimes skipped a required `notify`.
   - Chose: advisory lock for every hold path with an agent-role regression test; the playbook now deploys both targets from the candidate; the job engine guarantees chase and escalation delivery with a `notification_fallback` audit event. v0.4.0 shipped on the fourth candidate.
   - Why: local verification runs as the database owner with the scripted model, so grant boundaries and model nondeterminism only surface on the production gate.
