# Phase 5: Documentation, diagram, Devpost, video, posts, release

Depends on: Phases 0 to 4 merged to `develop`.
Branch: `docs/submission-final`, then the release PR `develop` to `main`.

## Tasks

- [ ] 5.1 ADR 0002 final addendum: production dispatch on AgentCore since the Phase 0 date, runtime ARN and version, memory id, tracing, rollback flag, and the 2026-09-03 `MODEL=bedrock` switch (verified by a live Okonkwo capture in 14.5 s).
- [ ] 5.2 Release playbook `docs/release/e2e-pro-playbook.md`: replace the "no candidate deployment verified" status and environment truth table with the actual state (v0.3.0 shipped 2026-09-01; Bedrock and AgentCore live), add the probe flags `--expect-runtime`, `--expect-email`, `--expect-memory`, and the AgentCore rollback template with `--lifecycle-configuration`.
- [ ] 5.3 `docs/release/runtime-database-and-identity.md`: AgentCore `DATABASE_URL` is the `layalga_agent` pooled URL in the runtime env; memory and SES IAM documents listed.
- [ ] 5.4 README: architecture paragraph (AgentCore selected, SES pings, Memory, Observability), four-beat demo refreshed with the generic room names, "What L'Ayalga remembers" and email pings sections, Strands badge 1.16.0.
- [ ] 5.5 Architecture diagram `docs/architecture/layalga-architecture.mmd`: `agentcore` becomes the selected worker (solid edges), add `memory` (AgentCore Memory), `ses` (Amazon SES, host pings), `otel` (CloudWatch GenAI Observability), `emailOutbox` in the Vercel subgraph; re-render SVG and PNG per `docs/architecture/README.md`; update the draw.io file.
- [ ] 5.6 `docs/security/data-lifecycle.md`: email pings retention, memory records and Forget, span content and log retention.
- [ ] 5.7 Devpost draft `docs/submission/devpost.md`: What it does (memory, pings, AgentCore, tracing), How we built it (MemoryManager over AgentCore Memory, ADOT, SES outbox), Built with (add AgentCore Memory, AgentCore Observability, Amazon SES), testing instructions section (demo host sign-in, four beats, what emails to expect), links filled after upload.
- [ ] 5.8 Video script `docs/submission/video-script.md`: new beats: "the house remembers" (captured Vega invitation recalls ground floor), the email arriving on a phone, the AgentCore trace screenshot, the run timeline; keep under 4:55.
- [ ] 5.9 builder.aws posts: refresh the three drafts with the shipped state; add a fourth candidate only if time remains (max three count). Publication is an owner action (D3 does not cover it).
- [ ] 5.10 Release: `/pre-launch`, `/update-docs`, `/release` per the playbook; PR `develop` to `main`; production deploy; full probe run with all `--expect-*` flags; tag last.
- [ ] 5.11 Record the video against the tagged production candidate; upload; write the URL into the Devpost draft; file the entry with the AWS Builder ID.

## Done when

- [ ] Every document names the same candidate commit and runtime ARN.
- [ ] Video under 5 minutes, public on YouTube, URL in `docs/submission/devpost.md`.
- [ ] Devpost entry filed before 2026-09-14 17:00 PDT.
