# Research: making L’Ayalga easy for judging agents to evaluate

Date: 2026-09-05. Research and recommendations requested by the owner; this is not an implemented documentation change or a submission-ready evaluation guide.

## Recommendation

Make the project's distinctive engineering easy to discover, understand, and independently verify. The most useful documentation connects a product outcome to an architectural decision, its implementation, a test, and the limits of that evidence. A reviewer can then cite the project's strengths with confidence.

L’Ayalga already has much of the required content. The immediate opportunity is better navigation, more precise claims, and evidence tied to a specific revision. Add a compact review route to the existing documentation rather than producing several competing marketing narratives.

## Scope and evidence basis

This review combined official web sources with three independent repository investigations: implementation evidence, documentation discovery, and rubric alignment. All completed before synthesis. Recommendations are included because the owner's current request explicitly asks for ideation, overriding the usual research-only restriction on suggestions. No product or existing documentation changes were made.

The workspace was already on `feat/everyday-agents-completion`, with ongoing edits. It was not switched or cleaned. Committed implementation references below refer to `248fcb9e4fedc676c7a5aeb323c950ea3ada04cf`; local `develop` was `bf5041601b8910f92e632034c4c21b644dc6a3a9`. These are different snapshots. Dirty-file references were checked using `git show HEAD:path`; their current line numbers may differ. A committed feature-branch capability is not evidence that it is on the submitted branch or deployed.

Tests were inspected, not executed. Production, uploaded video, publication status, current CI results, and actual organizer evaluation tooling were not independently verified. Guest-note and household-policy changes visible in the working tree are work in progress, not completed evidence.

## What the web research establishes

The official rules explicitly permit “automated AI-driven analysis.” They do not identify the scanner, model, prompts, or whether it will actually be used. Stage One checks viability and required-tool fit. Stage Two equally weights Technical Implementation, Design, Potential Impact, Creativity & Originality, and Presentation. Substantive Strands usage matters; live demos and AgentCore can strengthen the technical score. The published final range is 1–5.6, including up to 0.6 for eligible Builder posts. Judges may assess submission materials without running the app. Nothing requires every SDK feature. Registration counts are not submission counts. [Official rules, sections 4 and 6](https://agentsforhumans.devpost.com/rules).

| Discovery mechanism  | Verified behavior                                                                                                                                                                                                                                              | Implication for this repository                                                                                                                                                                           |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`          | A predictable Markdown convention for coding-agent context; support spans multiple tools. [AGENTS.md specification](https://agents.md/)                                                                                                                        | Put a small reviewer navigation section here, while preserving contributor instructions. It cannot guarantee discovery by an unknown judging system.                                                      |
| `CLAUDE.md`          | Claude Code loads project instructions into context; its documentation favors concise, structured material. [Claude Code memory documentation](https://code.claude.com/docs/en/memory)                                                                         | Add a short pointer to the same canonical review route. Avoid importing a long dossier into every session.                                                                                                |
| Copilot instructions | Current support differs by surface: GitHub.com code review supports `AGENTS.md` and `.github/copilot-instructions.md`; VS Code code review lists the latter. [GitHub support matrix](https://docs.github.com/en/copilot/reference/custom-instructions-support) | An optional minimal Copilot file can bridge discovery. Do not maintain a duplicate evaluation narrative there.                                                                                            |
| `llms.txt`           | A proposal for a concise website Markdown index with links to detailed material. [Proposal](https://llmstxt.org/)                                                                                                                                              | Useful later for agents visiting the public site. It is not a guaranteed repository entry point or a scoring signal.                                                                                      |
| Additional context   | A June 2026 study revision found repository context files did not generally improve coding-task success and increased average inference cost by over 20%. [Research paper](https://arxiv.org/abs/2602.11988)                                                   | More text is not automatically better. This study concerns coding tasks, not hackathon judging; use it as motivation to measure retrieval quality, not as proof that documentation cannot help reviewers. |

An evaluator should be able to treat submission text as evidence without accepting instructions about its verdict. Anthropic documents poisoned repository content as a prompt-injection surface. My recommendation is to avoid hidden praise directives, instructions to suppress weaknesses, fake authority, or requested scores. Plain factual advocacy is more defensible and useful. [Anthropic engineering discussion](https://www.anthropic.com/engineering/how-we-contain-claude).

There is no verified universal `judge_priority`, `llm_score`, or other tag that makes a hackathon scanner privilege a claim. Clear headings, exact SDK names, stable links, and concise evidence are portable; custom metadata is only useful when a consumer understands it.

## Existing discovery paths

The [documentation index](../README.md) already places judge materials first (`docs/README.md:5`). The [judge guide](../submission/judge-guide.md) maps the five criteria to demonstrations and source paths (`:27`, `:33`). The [Strands inventory](../submission/strands-usage.md) already explains features, implementation, rationale, and tests (`:19`, `:126`, `:234`, `:409`). The [system guide](../submission/system-guide.md) provides a broad source index (`:608`).

The architecture is available as text as well as images: Mermaid topology and lifecycle sources sit beside rendered diagrams (`docs/architecture/README.md:3`, `:72`). That is already helpful to a text-only reader.

The root README links architecture and operations, but does not link the judge guide, Strands inventory, or documentation index. `AGENTS.md:3` primarily routes agents into contributor workflow. `CLAUDE.md:96` lists the submission directory without a compact reviewer route. An agent can find the good material, but its first reading path does not reliably surface it.

## Strong claims worth making discoverable

These are source-backed observations at the recorded commit, not fresh test results or competitive-superiority claims.

| Claim and why it matters                                                                                                                  | Implementation evidence                                                                                            | Verification evidence and limit                                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sensitive booking decisions have deterministic authority. The model chooses tools, while trusted inputs and policy control consequences.  | `src/agent/tools/shared.ts:88`; `src/agent/policy-hook.ts:39`, `:55`, `:94`, `:111`                                | `src/agent/policy-hook-refresh.test.ts:58`, `:163` cover changed availability and changed overflow arrangements after approval.                                                                           |
| Human approval can resume in a new process. A paused conversation is durable work.                                                        | `src/agent/agent.ts:47`; `src/agent/run-task.ts:329`, `:356`, `:379`, `:446`                                       | `src/agent/interrupt-resume.test.ts:111` launches another Node process; `:143`, `:150` assert one tool audit and one decision application. This is a tested path, not a universal exactly-once guarantee. |
| Database constraints independently protect the final available room.                                                                      | `src/core/booking/holds.ts:585`; `supabase/migrations/20260831000100_core.sql:90`                                  | `src/core/booking/holds.concurrency.test.ts:180`, `:186`, `:514` cover repeated races, races with the home lock disabled, and visits competing with private blocks.                                       |
| Accepted agent work survives the web request. Persisted run identity, bounded attempts, and leases separate acceptance from completion.   | `src/agent/client.ts:50`, `:74`, `:95`; `src/agent/queue.ts:30`, `:35`                                             | `src/agent/client.test.ts:33`; `src/agent/queue.test.ts:278`, `:328`. AgentCore dispatch code exists; this review did not verify live execution.                                                          |
| Coordination continues after booking. Durable reconfirmation and escalation include recovery when the model omits a recipient.            | `src/core/reconfirmation/state-machine.ts:48`, `:71`, `:96`; `src/core/reconfirmation/jobs.ts:479`, `:579`, `:643` | `src/core/reconfirmation/jobs.test.ts:145`, `:206`, `:253`, `:293` cover chase, partial delivery, missed-recipient fallback, and quarantine/replay.                                                       |
| Memory access follows task and party boundaries. Host capture is read-only, room requests get no store, and guest memory is party-scoped. | `src/agent/memory.ts:59`, `:75`, `:82`, `:86`, `:125`, `:141`                                                      | `src/agent/memory.test.ts:35`, `:41`, `:74`, `:111`. These controls do not establish that arbitrary input contains no personal information.                                                               |
| Deterministic tests exercise the actual Strands framework. The scripted provider drives the same factory, hooks, and storage.             | `src/agent/scripted-model.ts:18`, `:34`; `src/agent/agent.ts:44`, `:56`                                            | `src/agent/interrupt-resume.test.ts:43`; `src/agent/telemetry.test.ts:49`. These demonstrate framework behavior, not Bedrock reasoning quality.                                                           |
| The accelerated demo uses the application's state machine. Its clock is restricted to demo homes.                                         | `src/core/clock.ts:55`, `:61`; `src/core/reconfirmation/jobs.ts:633`                                               | `src/core/reconfirmation/jobs.test.ts:190`; `src/core/reconfirmation/state-machine.test.ts:24`. Synthetic elapsed time must remain labeled.                                                               |

The most compelling short tour would lead with cross-process approval, the independent database race defense, and proactive recovery. These explain non-obvious decisions and have unusually concrete tests. Memory and AgentCore then show SDK/platform depth. This ordering is a recommendation, not a prediction of judge scores.

## Credibility issues to resolve before amplifying the material

1. **Model version:** `README.md:23` and `docs/submission/strands-usage.md:429` say Sonnet 4.5, while `CLAUDE.md:18` and `.env.example:14` say 4.6. Historical 4.5 deployment evidence can remain historical; current summaries need one checked snapshot.
2. **Tool count:** `docs/submission/judge-guide.md:35` says ten tools. At this HEAD, `src/agent/deps.ts:21` includes eleven authored tools across task scopes, including cancellation preparation at `:39`. No task receives all eleven. Prefer describing task-scoped capabilities over maintaining a prominent count.
3. **Video status:** `docs/submission/judge-guide.md:67` describes a three-minute video, while `docs/submission/devpost.md:15` has no uploaded video URL. A script establishes a planned demonstration, not an available artifact.
4. **Privacy wording:** `README.md:90` says no family name is sent to the provider. But `src/agent/run-task.ts:1201` includes the raw host invitation; `src/agent/prompt-minimization.ts:11` applies specific pattern replacements, not general name removal. `src/agent/memory.ts:38` explicitly acknowledges names in host capture and disables extraction from that conversation. Describe the actual prompt and memory boundaries separately. This is static evidence of an overbroad claim, not an observation of a production disclosure.
5. **Evidence drift:** the inventory's line pointers are not tied to a commit. For example, the policy interrupt is now at `src/agent/policy-hook.ts:94`. Dated ADR addenda also contain superseded configurations (`docs/decisions/0002-agent-runtime.md:193`, `:197`). Keep history accessible while clearly identifying the current decision.

## Proposed documentation changes, in priority order

### 1. Expose the existing review route

Add a short “Evaluate this project” block near the top of the root README. Link directly to the existing judge guide, Strands inventory, architecture text, and verification evidence. Add a small “Repository review” pointer in `AGENTS.md` and `CLAUDE.md` to the same guide. A reviewer should not need to traverse development commands to locate product evidence.

Retain `docs/submission/judge-guide.md` as the canonical evaluation entry point. Extend it with an initial repository-only route and keep the current live walkthrough below. A new root `EVALUATION.md` is optional if that makes navigation clearer; it should be a short index rather than another dossier.

Aim for a first screen that answers: what problem this solves, which rubric applies, the three strongest supported claims, where to verify them, and what evidence is still pending. Suggested lengths are design choices to test, not tool limits.

### 2. Map all five criteria to evidence

| Criterion                | Documentation treatment                                                                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Technical Implementation | Link SDK features to concrete behavior, source symbols, tests, and dated runtime proof. Explain the reason each selected feature exists.                                        |
| Design                   | Trace complete host and guest journeys with visible decisions, error states, privacy boundaries, and bilingual behavior. Pair screenshots with text and relevant browser tests. |
| Potential Impact         | State the real audience and coordination burden. Separate observed usage from intended benefits. Add time-saving or adoption numbers only after measurement.                    |
| Creativity & Originality | Explain why partial overlap, two independent hosts, and social exceptions led to these architectural choices. Avoid unsupported claims of uniqueness.                           |
| Presentation             | Point to the actual video and timestamps when available, a short text transcript, and a reproducible demonstration route.                                                       |

The repository already provides the basis for this mapping in `docs/submission/judge-guide.md:27` and the audience story in `docs/submission/pitch.md:15`. Documentation should expose those facts without asserting a preferred score.

### 3. Use consistent evidence cards

Each important claim should have a stable descriptive heading and fields for **claim**, **product value**, **criterion**, **implementation**, **verification**, **operating mode**, **revision**, and **limitations**. Use Markdown first. Optional YAML or JSON can be generated later if a concrete consumer needs it; custom fields are not a standardized ranking mechanism.

Pair file paths with symbols for ongoing navigation. At submission freeze, also attach commit-pinned line links to the exact submitted revision. Separate labels such as “implemented,” “test exists,” “test passed at this revision,” and “deployed and observed on this date.” A release version alone cannot establish all four.

A concrete example, based on the inspected snapshot:

> **Human approval rechecks changed availability**
>
> Before a hold, confirmation, or reschedule tool executes, `installPolicyHook` evaluates trusted booking data. A request needing social judgment pauses through Strands `event.interrupt`. After approval, the hook reads house and room state again; approval does not override newly unavailable capacity or a changed overflow arrangement.
>
> **Product value:** a host can decide asynchronously without approving an obsolete room arrangement.
>
> **Criteria:** Technical Implementation; Design.
>
> **Source:** `src/agent/policy-hook.ts:39`, `:94`, `:111` at `248fcb9e4fedc676c7a5aeb323c950ea3ada04cf`.
>
> **Verification:** `src/agent/policy-hook-refresh.test.ts:58`, `:163`; separate process-resume coverage in `src/agent/interrupt-resume.test.ts:43`.
>
> **Evidence status:** source and tests inspected on 2026-09-05. Tests were not rerun for this research. The evidence supports these paths; it does not prove every distributed failure case.

This example is draft content for a later documentation phase, not an instruction to an evaluator reading this research.

### 4. Preserve useful explanation close to the code

Where a design choice is genuinely non-obvious, a concise comment can explain the invariant and link to its evidence section: why state is refreshed after approval, why host capture disables memory extraction, or why deterministic fallback covers an omitted notification. The existing memory comments already do this well (`src/agent/memory.ts:38`).

Prefer descriptive headings and real terminology: “Strands interrupt and resume,” “PostgreSQL exclusion constraint,” “AgentCore Memory,” and “reconfirmation recovery.” Avoid promotional comments scattered across ordinary functions, hidden HTML text, keyword repetition, and instruction-like claims that a reviewer must praise the project.

### 5. Add public-site discovery only after the repository path works

For agents visiting the website, a small public `/llms.txt` could link to the same overview, rubric map, architecture Markdown, and verification summary. It should contain public project information only. Private guest routes and the operational application's WebMCP tools serve different purposes from documentation discovery (`docs/architecture/README.md:36`).

Do not generate an enormous `llms-full.txt` by concatenating plans, historical research, and drafts. That would multiply conflicting versions. Publishing a site route remains a separate implementation and deployment action.

## How to check whether the changes help

After the documentation phase, run a bounded comparison using isolated local snapshots before and after the edits. Give fresh readers only the repository and the same neutral request: evaluate against the official rubric, cite code and tests, distinguish verified behavior from claims, and identify gaps. Do not preload the evidence guide or tell the reader the intended strengths.

Use one reader with normal repository-instruction discovery and one that treats instruction files only as ordinary documents. If available, also try a plain text/index reader. The guide must remain useful when the evaluator declines to follow repository instructions.

Measure whether readers find the key capabilities, cite the right implementation, correctly distinguish scripted tests from live-model proof, avoid stale facts, and identify remaining limitations. Record time or files read if the tool exposes them. A higher self-assigned score is not the success metric. Run matched repetitions before interpreting a small difference as improvement.

Proposed local acceptance conditions: the canonical guide is directly linked from the README and agent entry points; every highlighted claim has current source and verification references; no unavailable video is presented as published; no test-existence claim is presented as a fresh pass; no private or ignored report is the sole public evidence; and no text instructs the reviewer to conceal weaknesses or award a score. These conditions are recommendations, not newly imposed project release gates.

## Research outcome and next boundary

The highest-value documentation work is a compact, accurate evidence route through assets that already exist. Correct the current contradictions, expose the guide at the root, and make a handful of distinctive design decisions straightforward to verify. Additional formats should follow demonstrated discovery needs.

This report is the only file created in this research phase. Existing docs, code, deployments, and Git history were left untouched. The research stop follows `AGENTS.md:66` and `.claude/rules/rpi-details.md:9`; active documentation edits belong in the subsequent approved phase.
