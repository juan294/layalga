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
