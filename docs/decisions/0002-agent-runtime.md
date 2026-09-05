# ADR 0002: Agent runtime

Date: 2026-08-29

Status: Accepted

## Context

L'Ayalga needs a runtime for the Strands TypeScript agent. The preferred path is an Amazon Bedrock AgentCore Runtime Node 22 direct-code deployment. The fallback is the same `runAgentTask` interface in a local Next.js route. Phase 0 must prove that a Strands hook interrupt is saved to Postgres and resumes in a different AgentCore runtime session without executing the gated tool more than once.

## Decision

Use the local Next.js runtime path for the hackathon build: `AGENT_RUNTIME=local`.

The authorized AgentCore direct-code deployment reached `READY`, loaded the packaged application, and started Fastify on port 8080. The first model invocation then failed because Bedrock reported that Anthropic use-case details were not active for AWS account `106403001709`. A direct `aws bedrock-runtime converse` call returned the same error, so the failure was not caused by AgentCore, the application package, or its IAM role. Phase 0 defines any failed assertion as the `local` verdict. The failed runtime `layalga_agent-h3IZEMHONS` was deleted. The versioned S3 bucket and runtime role remain for a later retry.

Two local compatibility facts have been observed:

- A fully bundled ESM artifact built, but Node 24 could not start it because Fastify's CommonJS dependency graph reached a dynamic `require("node:events")`. The deployment package therefore bundles local source only with `--packages=external` and vendors production `node_modules`. This retains ESM while using the dependency packaging that AgentCore supports.
- Strands 1.15.0 validates session identifiers with `^[a-z0-9_-]+$`. The spike uses `spike_<uuid>` instead of the planned `spike:<uuid>`. Production session prefixes must use `inv_` and `tick_` instead of colons unless the SDK changes.

## Deviations

| Plan said                                                                | Found                                                                            | Chose                                                                                          | Why                                                                                    |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Bundle every dependency into one ESM file, with CommonJS as the fallback | Fully bundled ESM fails at startup on Fastify's dynamic `require("node:events")` | Bundle local TypeScript with `--packages=external`; vendor production `node_modules`; keep ESM | This is the supported zip packaging form and does not include development dependencies |
| Use `spike:<uuid>` session identifiers                                   | Strands 1.15.0 accepts only lowercase letters, digits, underscores, and hyphens  | Use `spike_<uuid>` and reserve `inv_` and `tick_` for later phases                             | Invalid identifiers fail before session restore can run                                |

## Executed command sequence

These are the material commands that were run from the repository root. Secret values are loaded from `.env.local` and are not repeated here.

```bash
pnpm --dir spike/agentcore install --prod=false --frozen-lockfile
pnpm --dir spike/agentcore run typecheck
pnpm --dir spike/agentcore run bundle

aws s3api create-bucket \
  --bucket layalga-agent-bundles-106403001709 \
  --profile archy \
  --region us-east-1

aws iam create-role \
  --role-name layalga-agentcore-runtime \
  --assume-role-policy-document file://infra/iam/agentcore-runtime-trust.json \
  --profile archy

aws iam put-role-policy \
  --role-name layalga-agentcore-runtime \
  --policy-name layalga-agentcore-runtime \
  --policy-document file://infra/iam/agentcore-runtime-execution.json \
  --profile archy

aws s3 cp spike/agentcore/dist/deployment_package.zip \
  s3://layalga-agent-bundles-106403001709/agentcore-spike/deployment_package.zip \
  --profile archy \
  --region us-east-1

set -a
source .env.local
set +a
export DATABASE_URL=$(SUPABASE_DB_PASSWORD="$SUPABASE_DB_PASSWORD" SUPABASE_PROJECT_REF="$SUPABASE_PROJECT_REF" node -e 'const p=encodeURIComponent(process.env.SUPABASE_DB_PASSWORD); process.stdout.write(`postgresql://postgres.${process.env.SUPABASE_PROJECT_REF}:${p}@aws-0-us-east-1.pooler.supabase.com:5432/postgres`)')
runtime_env=$(jq -cn --arg databaseUrl "$DATABASE_URL" --arg modelId 'us.anthropic.claude-sonnet-4-5-20250929-v1:0' '{DATABASE_URL:$databaseUrl,BEDROCK_MODEL_ID:$modelId,AWS_REGION:"us-east-1"}')

aws bedrock-agentcore-control create-agent-runtime \
  --agent-runtime-name layalga_agent \
  --agent-runtime-artifact '{"codeConfiguration":{"code":{"s3":{"bucket":"layalga-agent-bundles-106403001709","prefix":"agentcore-spike/deployment_package.zip","versionId":"xYpeHW6JS4BsptyRZCxaboP4qAPBqU6Q"}},"runtime":"NODE_22","entryPoint":["app.js"]}}' \
  --role-arn arn:aws:iam::106403001709:role/layalga-agentcore-runtime \
  --network-configuration '{"networkMode":"PUBLIC"}' \
  --protocol-configuration '{"serverProtocol":"HTTP"}' \
  --lifecycle-configuration '{"idleRuntimeSessionTimeout":300,"maxLifetime":1800}' \
  --environment-variables "$runtime_env" \
  --profile archy \
  --region us-east-1

# The first package preserved pnpm symlinks. The working hoisted package was
# uploaded and applied with this final observed version.
aws s3api put-object \
  --bucket layalga-agent-bundles-106403001709 \
  --key agentcore-spike/deployment_package.zip \
  --body spike/agentcore/dist/deployment_package.zip \
  --profile archy \
  --region us-east-1
aws bedrock-agentcore-control update-agent-runtime \
  --agent-runtime-id layalga_agent-h3IZEMHONS \
  --agent-runtime-artifact '{"codeConfiguration":{"code":{"s3":{"bucket":"layalga-agent-bundles-106403001709","prefix":"agentcore-spike/deployment_package.zip","versionId":"pOUJC0dv0hROobBFhbzBpvcDoyLl4Mx3"}},"runtime":"NODE_22","entryPoint":["app.js"]}}' \
  --role-arn arn:aws:iam::106403001709:role/layalga-agentcore-runtime \
  --network-configuration '{"networkMode":"PUBLIC"}' \
  --protocol-configuration '{"serverProtocol":"HTTP"}' \
  --lifecycle-configuration '{"idleRuntimeSessionTimeout":300,"maxLifetime":1800}' \
  --environment-variables "$runtime_env" \
  --profile archy \
  --region us-east-1

export AGENTCORE_RUNTIME_ARN=arn:aws:bedrock-agentcore:us-east-1:106403001709:runtime/layalga_agent-h3IZEMHONS
export AWS_PROFILE=archy
export AWS_REGION=us-east-1
(cd spike/agentcore && node --import tsx scripts/spike.ts)
aws bedrock-runtime converse \
  --model-id us.anthropic.claude-sonnet-4-5-20250929-v1:0 \
  --messages '[{"role":"user","content":[{"text":"Reply OK"}]}]' \
  --profile archy --region us-east-1
aws logs tail /aws/bedrock-agentcore/runtimes/layalga_agent-h3IZEMHONS-DEFAULT \
  --since 10m \
  --profile archy \
  --region us-east-1
aws bedrock-agentcore-control delete-agent-runtime \
  --agent-runtime-id layalga_agent-h3IZEMHONS \
  --profile archy \
  --region us-east-1
```

Secrets were not written to repository files.

## Observations

| Measurement                           | Observed value                                                                                              |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Bundle format                         | ESM local-source bundle with external packages and vendored production dependencies                         |
| Bundle size                           | 17,023,530 bytes, S3 version `pOUJC0dv0hROobBFhbzBpvcDoyLl4Mx3`                                             |
| Runtime ARN                           | `arn:aws:bedrock-agentcore:us-east-1:106403001709:runtime/layalga_agent-h3IZEMHONS` (deleted after verdict) |
| Initial create to first process start | 66 seconds, from `15:10:19` to `15:11:25` UTC                                                               |
| Hoisted-package update to listening   | 33 seconds, from `15:13:50` to `15:14:23` UTC                                                               |
| Failed model request                  | 298 milliseconds in the diagnostic runtime log                                                              |
| Runtime deletion                      | `DELETING` to not found within the next 5-second poll                                                       |
| Start invocation                      | Failed before the agent could call a tool: Anthropic use-case details not active                            |
| Approved resume                       | Not reached                                                                                                 |
| Declined resume                       | Not reached                                                                                                 |
| Four-invocation wall time             | Not reached                                                                                                 |
| Snapshot interrupt state              | Not reached                                                                                                 |
| Direct Bedrock control                | Same `ResourceNotFoundException` as AgentCore                                                               |
| CloudWatch logs                       | Read successfully from `/aws/bedrock-agentcore/runtimes/layalga_agent-h3IZEMHONS-DEFAULT`                   |

## Consequences

Phase 1 removes `spike/agentcore/` and keeps the `agent_sessions` table. The web application and tests use the shared `runAgentTask` interface with the local runtime. Phase 4 uses the Vercel Cron fallback and skips the real EventBridge-to-AgentCore schedule proof. A later retry can reuse `layalga-agent-bundles-106403001709` and `layalga-agentcore-runtime` after the Anthropic use-case form becomes active.

## Implementation addendum: 2026-08-30

The selected runtime remains `AGENT_RUNTIME=local`, but HTTP requests no longer wait for model execution. Each accepted task creates or reuses an idempotent `runs` row with status `queued`. Next.js `after()` can claim the run opportunistically. The authorized `/api/ticks` route recovers expired leases and drains at most two runs per invocation. A terminal result belongs to the exact run ID returned in the queued acknowledgement.

This queue is also the compatibility boundary for a later AgentCore retry. The direct-code handler accepts an `execute_run` envelope containing an existing run ID, claims that row, and brackets execution with AgentCore asynchronous-task accounting. It does not create a second logical run or keep the caller waiting for model completion.

Runtime database authority is split. Vercel uses the `layalga_web` login and its explicit grant role. A future AgentCore worker uses `layalga_agent`. Migration and retention operations stay on an administrative connection. This refinement does not change the local runtime verdict or the conditions for retrying Bedrock.

## AgentCore retry addendum: 2026-08-31

The account-level Anthropic use case was submitted and accepted. A direct Bedrock `Converse` request to `us.anthropic.claude-sonnet-4-5-20250929-v1:0` then returned `OK`. Claude Sonnet 5 remained unavailable to this account, so the retry used the newest accessible Sonnet model rather than blocking on an AWS Sales access path.

The retry found and fixed four runtime boundaries:

- The production bundle now installs only the six direct runtime dependencies and uses pnpm's hoisted layout. This reduced the transformed artifact from 275,489,461 uncompressed bytes and 113,860 ZIP entries to 62,694,999 bytes and 17,390 entries.
- The AgentCore entrypoint no longer imports `LocalAgentClient`, because that Vercel implementation imports `next/server`. Tick execution calls the shared `runAgentTask` function directly.
- Per-home run serialization now uses a transaction-scoped advisory lock. `SELECT ... FOR UPDATE` required `UPDATE` permission on `homes`, which conflicts with the read-only home-policy boundary of `layalga_agent`.
- The web-side AgentCore client requests `text/plain`. `bedrock-agentcore` 0.4.3 and `@fastify/sse` 0.4.0 reject a non-streaming object response, while the supported text branch serializes the same JSON result safely.

Runtime `arn:aws:bedrock-agentcore:us-east-1:106403001709:runtime/layalga_agent-mONXXjFms4`, version 7, reached `READY`. One synthetic `host_capture` invocation returned completed run `07397d2b-f104-4ca6-a98a-877f6e0c4e68`. Independent PostgreSQL evidence showed invitation `133cd1bb-249d-411c-bff4-723df4ebe359`, an `agent` audit event with kind `tool_call` and name `capture_invitation`, one durable session record, and no run error. The runtime connected as the non-owner `layalga_agent` role; checks confirmed no `auth` schema usage, no `CREATE` on `public`, and the required invitation DML grant.

This proves a real AgentCore model-and-tool run. It does not replace the original fail-closed production selection. `AGENT_RUNTIME=local` remains the selected production setting until the full interrupt-and-resume cloud sequence passes and the owner separately authorizes the runtime switch and release.

## Production runtime addendum: 2026-09-03

Phase 0 of the final-stretch plan made the AgentCore runtime the production execution path for agent runs.

Deployment. `scripts/deploy-agentcore.sh` bundles `src/agent/runtime/agentcore.ts`, uploads `agentcore/deployment_package.zip` to `layalga-agent-bundles-106403001709`, and updates the existing runtime `arn:aws:bedrock-agentcore:us-east-1:106403001709:runtime/layalga_agent-mONXXjFms4`. Version 10 (S3 object version `byTP4ImjthsdFf5jArtwq2U55Av_1Kzq`) reached `READY`. The runtime environment carries `DATABASE_URL` for the `layalga_agent` login, `BEDROCK_MODEL_ID`, `AWS_REGION`, `MODEL=bedrock`, `APP_URL`, `LINK_TOKEN_SECRET`, and `AGENT_EXECUTION_RUNTIME=agentcore`. The web IAM user `layalga-web` gained `bedrock-agentcore:InvokeAgentRuntime` on `layalga_agent-*` runtimes; the model allow and the workload-identity deny are unchanged.

Boundaries found and fixed:

- The AgentCore container runs with `NODE_ENV=production`, so the shared environment validator applied the web contract and rejected the runtime with `AGENT_RUNTIME: Required`. `AGENT_EXECUTION_RUNTIME=agentcore` now selects an agent-process profile that validates only the database URL, the https application URL, the link secret, and the model settings.
- A bare `tick` task sent by the demo clock or the cron path executes synchronously through `runAgentTask`; the caller already holds the job claim. The EventBridge target sends a `scheduled_tick` envelope that keeps the claim-and-run path.
- Every terminal run result records `executedOn` (`local` or `agentcore`), so a run record proves where it executed.
- Hand-built `ZodError` values are not `Error` instances; the handler now logs structured error detail including issue paths.
- The temporary-hold path still locked the home with `select ... for update` when a host approval was applied. `layalga_agent_runtime` has no `UPDATE` on `homes`, so the approved overflow hold failed with `permission denied for table homes`, the model retried the tool under a new tool-use id, and the policy hook opened a second identical decision. The lock is now the same transaction-scoped advisory lock the other paths use, and a database-backed test places an approved hold as the agent runtime role. Local runs execute as the database owner and could not see this boundary.
- The first production probe run after that fix still failed because the runtime bundle had not been rebuilt from the candidate: the web deployment had the fix and the agent did not. A release now deploys both targets from the same commit; the playbook records it.
- With the real model, the tick agent sometimes did not call `notify` for every required recipient. `executeClaimedJob` now writes the missing reconfirmation chase or escalation notifications itself, from the same bilingual templates the scripted model uses, and records a `notification_fallback` audit event. The model's own copy still wins when it exists; the delivery guarantee belongs to the job engine, not the prompt.

Evidence. `scripts/agentcore-smoke.ts` enqueued a synthetic `host_capture` through `AgentCoreClient` and observed completed run `c05759c1-49ae-4823-8b62-5482dae356a0` with `executedOn = "agentcore"` and a structured invitation summary, then removed its tagged rows. The runtime connected as `layalga_agent`; the identity evidence query returned no role capabilities, no `auth` schema usage, no `CREATE` on `public`, invitation DML granted, and no identity-claim column privileges.

Decision. Production dispatch uses `AGENT_RUNTIME=agentcore` with `AGENTCORE_RUNTIME_ARN` set to the runtime above. Release v0.4.0 (main `0935fed7fcc6e57b8beb47fa213bf3c15490693b`, tag `v0.4.0`) deployed that commit to Vercel production and to runtime version 12 (S3 object version `flKClDIfRTpy2Uae1ThFc4mzcbpWSIE1`). All nine release probes passed against `https://layalga.thecreativetoken.com` with `--expect-runtime agentcore`: the host capture and the interrupt-and-resume runs executed on AgentCore, the four-beat reconfirmation produced exactly two host escalations, and the tagged synthetic rows were removed. The runtime log group `/aws/bedrock-agentcore/runtimes/layalga_agent-mONXXjFms4-DEFAULT` recorded ten invocations and no failures in the probe window. Rollback is `AGENT_RUNTIME=local` in Vercel production plus a redeploy; the previous agent bundle is S3 object version `byTP4ImjthsdFf5jArtwq2U55Av_1Kzq`.

Bundle size (Phase 4, tracing). `scripts/build-agent-bundle.sh` output, measured with `pnpm run agent:bundle`: before adding ADOT for Node (`@strands-agents/sdk` 1.15.0, no tracing dependencies), the deployment zip was 20,618,456 bytes (~19.7 MiB), 102 MiB unpacked. After adding `@aws/aws-distro-opentelemetry-node-autoinstrumentation` 0.12.0 and upgrading to `@strands-agents/sdk` 1.16.0, the zip grew to 109,326,092 bytes (~104.3 MiB), 407 MiB unpacked; roughly 176 MiB of that growth was `@tobilu/qmd`, an optional local-embeddings dependency the 1.16.0 SDK upgrade introduced (`node-llama-cpp`, four `tree-sitter-*` parsers, `better-sqlite3`, a duplicate `typescript`), unrelated to tracing and unused by this codebase. `build-agent-bundle.sh` now writes a `pnpm-workspace.yaml` into the isolated build directory with `overrides: {"@tobilu/qmd": "false"}` before installing, dropping the zip to 40,350,174 bytes (~38.5 MiB), 206 MiB unpacked, with ADOT and the Strands SDK both still present and functional. A blanket `pnpm install --no-optional` was tried first and rejected: it also excludes an unrelated optional dependency several levels behind ADOT's own `auto-instrumentations-node` (`resource-detector-gcp` -> `gcp-metadata` -> `gaxios` -> `rimraf` -> `glob` -> `jackspeak`'s optional `@pkgjs/parseargs`), which triggers a pnpm dependency-resolution bug (`ERR_PNPM_LOCKFILE_MISSING_DEPENDENCY`) reproducible even installing ADOT alone with no lockfile on disk; the package-scoped override avoids that path entirely. ADOT's own gRPC OTLP exporter packages and the ~40 per-library auto-instrumentations it bundles were evaluated for the same treatment and rejected: `@opentelemetry/sdk-node` and `auto-instrumentations-node` both perform unconditional top-level `require()` on every one of them regardless of the configured protocol or enabled instrumentation list, so excluding any would throw `MODULE_NOT_FOUND` when the deployed runtime's `NODE_OPTIONS=--require .../register` loads.

Tracing addendum. Runtime version 13 (S3 object version `ZNnPu9OzT6iEWQB6MQZF_qVxQlvQc2Zd`, built from develop `d3ecc65`) runs with ADOT for Node registered through `NODE_OPTIONS`, `OTEL_SERVICE_NAME=layalga-agent`, and 100 percent sampling. The runtime log shows "AWS Distro of OpenTelemetry automatic instrumentation started successfully" before the first invocation. CloudWatch Transaction Search is enabled (trace destination `CloudWatchLogs`, indexing at 100 percent) and the runtime log group retains 14 days. A smoke `host_capture` completed on the runtime in 22 seconds wall time including the cold start; X-Ray recorded trace `1-6a9aacb6-1d22ecc209025ebe66678d7c` with an 8.2 second `layalga-agent` segment carrying the `invoke_agent Strands Agent` span and two `BedrockRuntime` calls. The tracing bundle is 40,350,174 bytes zipped, up from 20,618,457 bytes for version 12; `--s3-version-id` on `scripts/deploy-agentcore.sh` deploys an object uploaded separately with multipart retries when the uplink is slow.

## Submission addendum: 2026-09-04

This addendum draws together the runtime state as of Phase 5 (documentation and submission). It does not repeat evidence already recorded above; it names the current values so every submission document can cite the same runtime ARN, version, and memory id.

Runtime. Production dispatch has used `AGENT_RUNTIME=agentcore` continuously since the production runtime addendum above (2026-09-03). The runtime is `arn:aws:bedrock-agentcore:us-east-1:106403001709:runtime/layalga_agent-mONXXjFms4`, currently at version 13 with ADOT tracing registered (the tracing addendum above). `scripts/deploy-agentcore.sh` redeploys it per release from the exact release candidate commit, using `--lifecycle-configuration '{"idleRuntimeSessionTimeout":300,"maxLifetime":1800}'` on both `create-agent-runtime` and `update-agent-runtime`. Rollback remains a one-flag change, `AGENT_RUNTIME=local` in Vercel production plus a redeploy; a rollback of the AgentCore artifact itself replays a prior S3 object version (recorded per release, for example `byTP4ImjthsdFf5jArtwq2U55Av_1Kzq` for the pre-tracing build) through `update-agent-runtime` with the same `--lifecycle-configuration`, or through `scripts/deploy-agentcore.sh --s3-version-id <version>` to skip a rebuild.

Model. The AgentCore runtime environment sets `MODEL=bedrock` explicitly, matching decision D4 of the final-stretch plan ("Production already runs `MODEL=bedrock`, switched and verified 2026-09-03"). The trace screenshot recorded for submission (`docs/submission/assets/agentcore-trace.png`, trace `6a9aacb61d22ecc209025ebe66678d7c`) is itself live evidence of that switch on 2026-09-04: a `host_capture` run on the AgentCore runtime, model `us.anthropic.claude-sonnet-4-5-20250929-v1:0`, latency 8077.11 ms (8.08 s), 10,216 input and 322 output tokens (10,538 total, ~10.5K), nine spans, zero errors — the same run the tracing addendum above describes.

Memory. A household memory resource, `LayalgaHouseholdMemory-CBgKZc7mK4` (`arn:aws:bedrock-agentcore:us-east-1:106403001709:memory/LayalgaHouseholdMemory-CBgKZc7mK4`), exists with a 30-day event expiry and two strategies: `HouseholdPreferences` (`userPreference`, template `/parties/{actorId}/preferences`) and `HouseholdFacts` (`semantic`, template `/parties/{actorId}/facts`). `infra/iam/memory-data-plane.json` already scopes the eleven data-plane actions to that resource. The Strands `MemoryManager` integration (`src/agent/memory.ts`, `src/core/memory/*`, the host "What L'Ayalga remembers" panel) is implemented on `feat/household-memory` and not yet merged to `develop` at the time of this addendum; wiring `MEMORY=agentcore` and `MEMORY_ID` into Vercel production and the AgentCore runtime env, and redeploying the runtime, remain the outstanding Phase 3 AWS task. Until that step runs, production reads `MEMORY=none` and no recall or extraction happens; the resource and the IAM grant exist ahead of that activation.

Decision (unchanged). Production dispatch remains `AGENT_RUNTIME=agentcore`, selected in the production runtime addendum above. This addendum records state for documentation purposes; it does not itself authorize a new deployment or change the selected runtime.

Release v0.5.0 (2026-09-04). Candidate `c4e3ac3378b695e11af75781d7a5ed0b00b6f72b` was tagged after nine production probes passed with the runtime, email, and memory expectations; the AgentCore runtime was version 16, built from that commit. Two earlier candidates failed the gate: with memory on, the capture had copied recalled facts into the structured invitation, and the escalation tick exceeded the demo driver's 30 second API timeout. Both fixes shipped on develop before the third candidate. A follow-up (v0.5.1) removes capture conversations from memory extraction after family names appeared in extracted records, and renders preference records as text.

## Implementation addendum: 2026-09-05

AgentCore remains the selected execution path, with `AGENT_RUNTIME=local` as the fallback. Earlier version/model/memory activation statements above are dated observations, not a fresh inspection of deployed state. Current repository configuration selects Sonnet 4.6; historical Sonnet 4.5 trace evidence remains evidence of that earlier run. Model IAM allowlists and the configured deployment must agree before a later authorized release.

The completion branch adds host-owned versioned policy under the booking lock, explicit cancellation/withdrawal, visit-aligned bearer access, separate informational notes and bounded deterministic room preferences. Room search now reads the exact party memory namespace as well as supporting the agent's audited `search_memory` tool. Supported floor/bed preferences affect feasible recommendations only; guest choice and deterministic policy retain authority.

Guest verification, consent, return capabilities and external delivery belong to the web runtime. `guest_contacts`, `guest_email_outbox` and `guest_email_attempts` give the agent no access. Return links derive purpose-separated HMAC capabilities from persisted nonsecret identifiers and the invitation fingerprint, never by reconstructing an original bearer. Authorization receipts serialize with cancellation/opt-out; accepted versus unknown outcomes remain distinct from in-app notifications and guest silence. Synthetic homes never send guest email.

Raw host invitation/request text can still contain names despite omission of known identity fields. Capture conversations remain excluded from extraction; deterministic capture facts omit the family-name field. Neither this field minimization nor a scripted test proves arbitrary text is free of personal information.

Migrations `20260905000100` through `20260905000700` and the guest SES policy are locally prepared and verified; this work does not apply them to production or establish inbox delivery. Follow [guest email readiness](../release/guest-email-readiness.md) and the existing [release playbook](../release/e2e-pro-playbook.md). No new runtime, deployment or external-send authorization is created by this addendum.

## Release addendum: 2026-09-05 (v1.0.0)

Release v1.0.0 was tagged on `main` `0f1fcf2491e9728a2ac6cb177f62c9e3a8577278`, the second candidate. Migrations `20260905000100` through `20260905000700` were applied to production during candidate 1. The AgentCore runtime `layalga_agent-mONXXjFms4` ran version 20 (S3 object version `KaWO1cWA8rHkmkCxXxeGGHz15UfInU3c`) for candidate 1 `2641297` and version 21 (`zS_TSruUh49Wkl9EIVWcfhJVGJ5SnXtp`) for the tagged candidate; the version-20 object is the rollback bundle, and the v0.5.0 bundle remains `hCAxVUijow95VK3J7dLGmzqbtoCq7uAw`. The runtime env selects `us.anthropic.claude-sonnet-4-6`; every production run in this release executed on that model.

Candidate 1 was blocked by release probe 2. CloudWatch `aws/spans` traces showed two model behaviors on Sonnet 4.6 that Sonnet 4.5 had not shown in the v0.5.0 runs: the model restated the host message into the `capture_invitation` `rawMessage` argument without the `[release-probe:…]` tag, and in one run it called `capture_invitation` again after a successful call, creating two invitations per message. The first broke the probe's identification (it matched `invitations.raw_message` exactly); the second was a product gap. Both were fixed before candidate 2: probes identify captured invitations through the run's enqueue payload and the capture tool_call audit row, and the tool returns the run's existing invitation on a repeat call. One capture call also failed input validation because a `rememberedContext` entry exceeded 120 characters; the model retried and succeeded.

Consequence for the fallback: `infra/iam/web-bedrock-policy.json` now allows Sonnet 4.5 and 4.6 for the `layalga-web` user, so `AGENT_RUNTIME=local` can invoke the configured model again. AgentCore remains the selected runtime.
