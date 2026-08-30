# Phase 6: Submission deliverables

Days: 2026-09-10 to 2026-09-13. Depends on Phase 5. Filing target
2026-09-13; hard deadline 2026-09-14 17:00 PDT.

## Goal

Everything the judges see: README, architecture diagram, the five-minute
video, the Devpost entry, and drafts of up to three builder.aws posts.

## Tasks

- [x] 6.1 README rewrite: one-paragraph pitch leading with two hosts, partial overlap as a first-class concept, and human approval only for social exceptions; the four-beat demo; architecture summary linking the diagram; how the policy layer and the Strands interrupt work together (with the hook snippet); what is deterministic versus model-driven; setup (local stack, env, seed, `pnpm dev`); deployment (AgentCore or local verdict, EventBridge); safety contracts; the disclosure that cc-rpi v1.28.2 provided pre-existing development-process scaffolding and that all product code was created during the submission period; MIT license; synthetic data statement.
- [x] 6.2 Architecture diagram `docs/architecture/layalga-architecture.svg` and `.png` (rendered from a Mermaid or Excalidraw source committed alongside): hosts, guest, Next.js on Vercel, AgentCore Runtime with the Strands agent and the policy hook, Bedrock, Supabase Postgres, EventBridge Scheduler, the interrupt and resume loop drawn explicitly. Embedded in the README.
- [x] 6.3 Video script `docs/submission/video-script.md`: 0:00 problem and audience (lived, generalized to any home with more than one host), 0:45 beat 1, 1:30 beat 2, 2:15 beat 3 with the interrupt shown in the host view and the resume, 3:30 beat 4 with the labeled clock, 4:20 architecture slide and why Strands interrupts plus a deterministic policy, 4:50 close. Recording checklist: demo reset, both host tabs signed in, Spanish and English visible at least once.
- [ ] 6.4 Recording: owner records (or authorizes a screen recording produced with the demo-e2e driver for the narration to be added). Output under five minutes, uploaded where Devpost requires (owner action for the upload).
- [x] 6.5 Devpost text `docs/submission/devpost.md`: project name, tagline, inspiration, what it does, how it was built (Strands TypeScript SDK, AgentCore Runtime, Bedrock Sonnet 4.5, EventBridge Scheduler, Supabase, Next.js), challenges (interrupt persistence across microVMs, Scheduler's synchronous timeout, deterministic policy under an agent), accomplishments, what we learned, what is next, built-with list, repo link, live link, video link. Owner files it (needs AWS Builder ID and Devpost registration).
- [x] 6.6 builder.aws drafts under `docs/submission/posts/`: "Interrupts for household decisions", "A deterministic policy layer under a Strands agent", "Proactive follow-through with a controllable clock". Drafts only; publication is a separate authorization and happens only after 5.6 is stable.
- [ ] 6.7 Final `/pre-launch`, `/update-docs`, and `/release` per the playbook; tag `v0.1.2` last, after tag authorization.

## Verification

- `pnpm run build` green on `main`; README links resolve; diagram renders on
  GitHub.
- Video length checked (`ffprobe`), under 300 seconds.
- Devpost preview reviewed by the owner.

## Exit criteria

- Devpost entry submitted (owner confirms), repo public with README and
  diagram, video linked.

STOP. The plan is complete when the owner confirms the submission.
