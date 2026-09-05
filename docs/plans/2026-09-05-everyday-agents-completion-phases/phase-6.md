# Phase 6: Measured evidence, documentation and integration

Plan: `2026-09-05-everyday-agents-completion`. Depends on phase 5.

- [x] Extend/reuse local demo scenario to export measured synthetic action, duration, decision and follow-up outcomes including cancellation.
- [x] Write evidence artifact with exact definitions and no unmeasured time-saved claims; prepare participant protocol.
- [x] Refresh all current host/guest/system/judge guides, pitch/Devpost/Builder drafts, architecture rendered artifacts, README/CLAUDE, security and operational runbooks after final code.
- [x] Mark historical assessments superseded, preserve historical facts, update plan/docs indices and current roadmap.
- [x] Record production rollout and owner-only video/publication/user-study tasks precisely.
- [x] Independent full-scope review and dedicated simplification; fix all actual findings.
- [x] Run bootstrap, typecheck, lint, coverage, integration, build, E2E, demo and local release probes sequentially against final code.

No release or production claim may be inferred from a develop merge. Video recording/upload/entry and external article publication remain owner actions; independent human feedback remains unmeasured until actually collected.

## Local evidence checkpoint

September 5: benchmark source and protocol independently reviewed; its 16 configuration/aggregation regressions passed after a missing-module RED. The measured run is recorded below. All current product, host/guest, submission, security and release documents are refreshed; dated research and ADR observations are preserved with status pointers/addenda. Five Mermaid sources and native draw.io have regenerated paired exports, visually inspected. Relative targets across 79 Markdown files resolve; changed Markdown passes lint with existing formatting conventions preserved.

Bootstrap, typecheck, ESLint, 668 tests in 129 files (including database integration), 494 unit coverage tests, web production build and local agent bundle passed. Full desktop/mobile browser suite passed all 22 tests. Two earlier guided assertions expired while operations were still pending; navigation/HTTP-response synchronization replaced those five-second pre-response assertions. The affected pair passed with tracing. A subsequent local database/Docker response outage interrupted a full rerun; the healthy-stack rerun passed all 22 without product changes. Final release probes and measured artifact are recorded below.

Production migrations, IAM, deployment and consenting real-email proof remain pending authorized operations. No live model/memory, inbox receipt, independent human savings, publication or video is claimed by the scripted checks.

All nine local release probes passed on the normal Next.js dev command with `--expect-runtime local`, including the complete demo driver and verified synthetic cleanup. Web and agent builds, database integrations and all 22 browser checks passed before any remote push. Benchmark measurement is recorded below; integration is tracked by GitHub.

## Measured artifact

The [JSON artifact](../../submission/coordination-benchmark.json) and [report](../../submission/coordination-evidence.md) record source `54eab0860de93ae9d9289f228a4c6f38f24d8194`: 30/30 scripted actions passed, 29.85 seconds scenario wall time and 3.04 seconds startup, one simulated host approval and five guest decisions. Cancellation retired its real outstanding reminder and both rooms; the independent reconfirmation and exception/escalation rounds preserved their expected database outcomes. No human effort, real model/memory or inbox delivery was measured.

## Integration acceptance record

Local deliverables above are complete. The [completion pull request](https://github.com/juan294/layalga/pulls?q=is%3Apr+head%3Afeat%2Feveryday-agents-completion), its checks, linked issues and merged commit record the remote outcome. A local checkbox is not substituted for those observations. The final audit must verify:

- Inspect deployment triggers again; commit reviewed state; fetch/reconcile; push feature branch with preview suppression.
- Open reviewed PR targeting develop, monitor exact-head CI, merge squash, verify merged develop checks and no preview deployment.
- Close completed issues with evidence, update documentation verification record, commit/push any final documentation, and verify clean synced workspace.

Remote completion is recorded in that PR after exact-head and merged-develop checks, rather than creating a second hosted CI cycle solely to copy GitHub status into this file. The final local operational report records clean/synced workspace and no-preview observations. Production rollout remains separate.

## Integration correction

PR #111 initially passed unit/build, integration, CodeQL and dependency review; the English guided start failed browser acceptance. The original test reproduced locally with a trace showing a click but no reset request. The server rendered enabled controls before hydration. A delayed-JavaScript regression failed first, then passed with a source readiness guard; both complete English and Spanish guided scenarios also passed. The original workflow assertions and navigation timeout remain intact. The final corrected verification and merged-develop conclusions are recorded in the PR.

A subsequent full local suite exposed three five-second assertions while work was still queued/running or a reconfirmation POST was pending. All six affected tests passed the traced rerun without further product changes. Source inspection confirmed polling backs off to 15 seconds; shared exact terminal assertions now allow 30 seconds while requiring the same exact outcome, and search/reconfirmation/capture await their actual POSTs before checking the same-page result. Global timeouts remain unchanged. The Docker VM was heavily loaded during the failures; that observation alone does not establish causation.

Final test review applies the same synchronization contract across all eight search call sites, both reconfirmations, nine exact terminal-state assertions and both capture completions. Capture still requires its timeline and private link. No domain assertion is removed. A later reset timeout coincided with a separately observed direct local database CONNECT_TIMEOUT; after recovery the VM CPU dropped markedly without restarting services. Environment observations are kept separate from the confirmed hydration defect.

The final synchronized browser suite passed all 23 desktop/mobile tests in 1.6 minutes. Typecheck, ESLint, all 668 application tests and the production build passed for the source correction; subsequent changes were browser-test synchronization and documentation only.

All nine final local release probes also passed on normal Next dev, including the complete demo driver and verified cleanup, before the corrected push.

The corrected PR head 56dbc47 passed all required checks, but its detailed browser log recorded one successful retry at the first clock interaction. The merge remained on hold. The delayed-JavaScript regression reproduced enabled clock controls before hydration; the shared readiness hook now covers guided starts and all clock controls. The regression also verifies the clock request after scripts load, followed by exactly one reset and guest entry. This closes the related client-control exposure without interpreting a retry as clean first-attempt evidence.

The shared clock/start guard passed all three targeted guided tests, 668 application tests, 494 coverage tests, typecheck, lint, production build and all 23 browser tests (1.5 minutes, zero failures) locally.
