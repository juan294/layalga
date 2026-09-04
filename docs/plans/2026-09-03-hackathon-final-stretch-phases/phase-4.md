# Phase 4: OpenTelemetry tracing from the AgentCore runtime `[batch-eligible]`

Depends on: Phase 0 (runtime and deploy script). No file overlap with Phase 1.
Branch: `feat/agentcore-tracing`.

## Goal

Every Strands run on the AgentCore runtime emits GenAI spans (agent, cycle, model, tool, memory) that appear in CloudWatch GenAI Observability, with a screenshot-ready trace for the video.

## Design (VERIFIED constraints)

- Strands `Agent` uses the global OTel tracer provider automatically; no code change in `buildAgent`.
- ADOT for Node (`@aws/aws-distro-opentelemetry-node-autoinstrumentation`, 0.7.0 or later) registers the provider, signs with SigV4, and exports to the AgentCore runtime's own log group when the runtime provides its default ADOT env. Activation is `NODE_OPTIONS=--require @aws/aws-distro-opentelemetry-node-autoinstrumentation/register` in the runtime environment; the bundle must ship the package in `node_modules`.
- CloudWatch Transaction Search must be enabled once in the account (three CLI steps in the research report) before spans render.
- The runtime execution role already grants X-Ray and CloudWatch metrics (`infra/iam/agentcore-runtime-execution.json:33-45`); add `logs:PutResourcePolicy` on the agent log group only if unified span destination is used.
- 100 percent sampling for the demo (`OTEL_TRACES_SAMPLER=parentbased_always_on` default); document a 5 percent setting for after judging.
- Span content includes prompt and tool text. Guests are synthetic; the log group retention is set to 14 days; noted in `docs/security/data-lifecycle.md`.
- Upgrade `@strands-agents/sdk` to 1.16.0 for the cycle-span fix (#4054); no memory or interrupt changes between 1.15.0 and 1.16.0.

## Tasks

- [x] 4.1 Dependencies: `@aws/aws-distro-opentelemetry-node-autoinstrumentation` (latest 0.x), `@opentelemetry/api ^1.9.0` direct; `@strands-agents/sdk` 1.16.0; README badge to 1.16.0.
- [x] 4.2 Bundle: `scripts/build-agent-bundle.sh` includes the ADOT package in the derived `package.json` (it is not imported statically, so add it to an explicit include list).
- [x] 4.3 Runtime env in `scripts/deploy-agentcore.sh`: `NODE_OPTIONS`, `OTEL_SERVICE_NAME=layalga-agent`, `OTEL_SEMCONV_STABILITY_OPT_IN=gen_ai_latest_experimental`, `OTEL_TRACES_SAMPLER` default. Trace attributes on the agent: `traceAttributes: { "layalga.home_id": homeId, "layalga.task": task.task, "session.id": sessionId }` in `buildAgent` (ids only, no names).
- [x] 4.4 Account setup script `scripts/enable-transaction-search.sh` (idempotent: resource policy, `update-trace-segment-destination`, indexing rule 100 percent) and log group retention `aws logs put-retention-policy --log-group-name /aws/bedrock-agentcore/runtimes/<id>-DEFAULT --retention-in-days 14`.
- [ ] 4.5 Verify: run the smoke capture, open CloudWatch GenAI Observability, confirm the trace shows `invoke_agent`, `chat`, `execute_tool capture_invitation`; save the screenshot to `docs/submission/assets/agentcore-trace.png`.
- [x] 4.6 Unit test `src/agent/telemetry.test.ts`: with an in-memory span exporter registered globally, a scripted-model run emits `invoke_agent` and `execute_tool` spans with `gen_ai.tool.name` (proves Strands emits under a global provider, independent of ADOT).

## Done when

- [ ] Production run trace visible in CloudWatch GenAI Observability (M2), screenshot committed.
- [ ] Bundle size and cold start recorded in the ADR addendum.
- [ ] PR open; CI green.
