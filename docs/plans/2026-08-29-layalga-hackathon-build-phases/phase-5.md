# Phase 5: Deployment, demo hardening, end-to-end run

Days: 2026-09-08 to 2026-09-09. Depends on Phases 3 and 4.
Authorization: D3 for AWS; Vercel production deploy requires explicit
authorization at step 5.6; DNS already points at Vercel and is not touched.

## Goal

The four-beat demo passes on `https://layalga.thecreativetoken.com` with the
production agent runtime, the release probes from
`docs/release/e2e-pro-playbook.md` are executable, and the demo can be reset
and replayed in under two minutes.

## Tasks

- [ ] 5.1 IAM user `layalga-web` (policy: `bedrock-agentcore:InvokeAgentRuntime` on the runtime ARN and `<arn>/*`; explicit deny `bedrock-agentcore:GetWorkloadAccessTokenForUserId`); access key created by CLI and written to Vercel with `printf '%s' | vercel env add <NAME> production` for `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`. Skipped if verdict `local` (then `BEDROCK` access is needed instead: the same user gets `bedrock:InvokeModel*` on the Sonnet 4.5 inference profile and foundation model ARNs).
- [ ] 5.2 Vercel env for production and preview: every name in the plan's section 16, values from `.env.local` and the Supabase project; `AGENT_RUNTIME` per the ADR; `DEMO_MODE=true`; `SCHEDULER=eventbridge` or `none`. `vercel env ls` reviewed. If verdict `local`, add `crons` to `vercel.json`.
- [ ] 5.3 AgentCore runtime updated with the final bundle and production environment variables (`update-agent-runtime`); `StopRuntimeSession` used by the web client after completed non-tick runs to limit idle billing.
- [ ] 5.4 Demo hardening: `POST /api/demo/reset` verified idempotent; `scripts/demo-e2e.ts` runs the four beats through the public HTTP surface (capture as Nel, guest submit as Vega, capture as Covadonga, guest submit as the Oteros, approve as Nel, clock warp twice) and asserts the final state (two visits, one `escalated`, four notifications to hosts, one pending decision approved); runs against localhost with Bedrock first.
- [ ] 5.5 Release probes 1 to 8 from the playbook implemented in `scripts/release-probes.ts` using the demo home plus a probe home that is created and deleted by the script (probe 8, cleanup, deletes only rows tagged with the run id).
- [ ] 5.6 Production deploy: PR merged to `main` after authorization; Vercel deploys; `curl https://layalga.thecreativetoken.com/api/health` returns `ok` and the candidate commit; `scripts/demo-e2e.ts --base https://layalga.thecreativetoken.com` passes; `scripts/release-probes.ts` passes.
- [ ] 5.7 Rollback documented in `docs/release/e2e-pro-playbook.md`: `vercel rollback <previous-deployment>` for web; `update-agent-runtime` with the previous S3 `versionId` for the agent; re-run `/api/health` and probe 1.
- [ ] 5.8 Update the playbook's environment truth table and set the release decision to the observed state.

## Verification

Sequential: `pnpm run typecheck`, `pnpm run lint`, `pnpm run test`,
`pnpm run build`, `pnpm run test:e2e`, then `scripts/demo-e2e.ts` local,
then production after authorization.

## Exit criteria

- Four beats pass on the production URL twice in a row after a reset.
- Health, probes, and rollback documented with commands that were run.

STOP and wait for confirmation.
