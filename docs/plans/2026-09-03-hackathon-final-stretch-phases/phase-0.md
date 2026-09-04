# Phase 0: AgentCore runtime live and selected for production dispatch

Depends on: AWS profile `archy` present on this machine (`aws sts get-caller-identity --profile archy`).
Branch: `feat/agentcore-live`.

## Goal

A live `layalga_agent` runtime executes every production run through the `execute_run` envelope, the demo clock works under `agentcore`, probes prove where the run executed, and production Vercel dispatches to it.

## Tasks

- [x] 0.1 Inventory AWS state. `aws bedrock-agentcore-control list-agent-runtimes --profile archy --region us-east-1`; `aws s3api list-object-versions --bucket layalga-agent-bundles-106403001709 --prefix agentcore/`; `aws iam get-user-policy --user-name layalga-web --policy-name <name>`; `aws iam list-user-policies --user-name layalga-web`. Record whether `layalga_agent-mONXXjFms4` still exists (ADR 0002 line 157 does not say it was deleted).
- [x] 0.2 Record execution runtime on every run. Add `executedOn: "local" | "agentcore"` to the run result written by `runAgentTask` (`src/agent/run-task.ts`, the `result` JSON alongside `summary`). Source: `deps.executionRuntime`, set to `"agentcore"` in `src/agent/runtime/agentcore.ts` deps and `"local"` in `src/agent/runtime/local.ts`. Expose it in `RunSnapshot` (`src/app/api/runs/run-data.ts`) as `executedOn`.
- [x] 0.3 Make bare-task ticks synchronous on AgentCore. In `src/agent/runtime/agentcore.ts`, the `tick` branch reached by a bare task awaits `runJob` and returns the `RunResult`. Add a new envelope `{ operation: "scheduled_tick", homeId, jobId }` for the EventBridge target (`src/agent/scheduler/index.ts:63-74` payload) that keeps the fire-and-forget branch. Update `src/agent/runtime/request.ts` and its test.
- [x] 0.4 Web IAM. Add to `infra/iam/web-bedrock-policy.json` a statement `InvokeLayalgaAgentRuntime` allowing `bedrock-agentcore:InvokeAgentRuntime` on `arn:aws:bedrock-agentcore:us-east-1:106403001709:runtime/layalga_agent-*` and `.../layalga_agent-*/*`. Keep the model allow and the workload-identity deny. Apply with `aws iam put-user-policy --user-name layalga-web`.
- [x] 0.5 Deploy script `scripts/deploy-agentcore.sh`. Steps: `pnpm run agent:bundle`; `aws s3api put-object --bucket layalga-agent-bundles-106403001709 --key agentcore/deployment_package.zip --body dist/deployment_package.zip` capturing `VersionId`; read runtime env from a local gitignored file `.env.agentcore` (names: `DATABASE_URL` for `layalga_agent`, `BEDROCK_MODEL_ID`, `AWS_REGION`, `MODEL=bedrock`, `APP_URL=https://layalga.thecreativetoken.com`, `LINK_TOKEN_SECRET`, `CALENDAR_FEED_SECRET`, `AGENT_EXECUTION_RUNTIME=agentcore`); `create-agent-runtime` when no runtime exists else `update-agent-runtime`, both with `NODE_22`, `["app.js"]`, `HTTP`, `PUBLIC`, lifecycle `{idle 300, max 1800}`; poll `get-agent-runtime` to `READY`; print the ARN. Never echo env values. Add `.env.agentcore` to `.gitignore` (already covered by `.env.*`).
- [x] 0.6 Agent database credential. If the `layalga_agent` pooled URL is not available locally, reset the role password through the administrative connection per `docs/release/runtime-database-and-identity.md:16-22` and build the pooled URL. Verify with the evidence SQL at `:26-56` (`current_user = layalga_agent`).
- [x] 0.7 Deploy. Run `scripts/deploy-agentcore.sh --profile archy`. Invoke once with a synthetic `host_capture` through `AgentCoreClient` from a local script (`scripts/agentcore-smoke.ts`, reads `AGENTCORE_RUNTIME_ARN`), confirm a completed run with `executedOn = "agentcore"`, then delete the smoke invitation through the existing demo reset.
- [x] 0.8 Probe hardening. In `scripts/release-probes.ts`: `drainAndCollectTerminalRunResults` re-drains every 15 s up to 90 s; add `--expect-runtime local|agentcore` (`scripts/release-helpers.ts`) and assert `executedOn` on the probe 5 resume run and the probe 2 capture run when given.
- [x] 0.9 Switch production. `vercel env add AGENT_RUNTIME production` = `agentcore`, `AGENTCORE_RUNTIME_ARN` = new ARN (owner runs the two commands if the classifier blocks them), `vercel redeploy <current prod deployment> --target production`, health `ok`.
- [x] 0.10 Production gate. `pnpm run release:probes -- --base https://layalga.thecreativetoken.com --commit <sha> --expect-runtime agentcore` (needs the five production secrets in `.env.production.local`, owner-provided). Then `aws logs tail /aws/bedrock-agentcore/runtimes/<id>-DEFAULT --since 30m` shows the resume run.
- [x] 0.11 ADR 0002 addendum dated 2026-09-04: runtime ARN, S3 key and version, env names, IAM change, probe evidence, and the decision `AGENT_RUNTIME=agentcore` for production with rollback `AGENT_RUNTIME=local`. Update `scripts/infra-scheduler.sh:9-12` grep so it no longer short-circuits.

## Pseudocode

```ts
// src/agent/runtime/agentcore.ts
if (request.operation === "scheduled_tick") {
  /* existing async branch, returns accepted */
}
if (task.task === "tick") {
  // bare task from AgentCoreClient.run
  const deps = await runtimeDeps(task);
  await runJob(deps.db, deps.clock, tickAgent, task.jobId, deps.scheduler);
  return runResultForJob(deps.db, task.jobId); // { runId, status, executedOn: "agentcore" }
}
```

```ts
// src/agent/run-task.ts (terminal write)
result: { summary, executedOn: deps.executionRuntime ?? "local", usage: metricsFrom(result) }
```

## Tests

- `src/agent/runtime/request.test.ts`: parses `scheduled_tick`; rejects unknown operations.
- `src/agent/client.test.ts`: `run({task:"tick"})` resolves to a terminal `RunResult` with a fake invoke; demo clock route test uses `AgentCoreClient` fake and asserts notifications are returned.
- `src/agent/run-task-safety.test.ts`: terminal result carries `executedOn`.
- `scripts/release-probes` unit: `--expect-runtime` parsing.

## Done when

- [x] Runtime `READY`, smoke run `executedOn = "agentcore"`.
- [x] Production health `ok` with `AGENT_RUNTIME=agentcore`.
- [x] Nine probes pass on production with `--expect-runtime agentcore`; CloudWatch log shows the resume run.
- [x] PR open against `develop`; CI green.
