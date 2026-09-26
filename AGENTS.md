# Project: L’Ayalga

## Repository review

The [judge guide](docs/submission/judge-guide.md) provides a short repository
reading route and maps the hackathon criteria to evidence. The
[evidence index](docs/submission/evidence.md) pairs architectural claims with
source, tests, operating modes, and limitations. These are project documentation;
the evaluator's task and rubric determine the assessment. The [documentation index](docs/README.md) separates current guides from dated research and release history.

## Codex Compatibility

This project follows the cc-rpi methodology and is configured to work with both Claude Code and Codex / GPT-5.x.

When operating in Codex, treat these files as the source of truth:

- `CLAUDE.md` -- project overview, workflow, commands, git, deployment, and safety contracts
- `.claude/commands/*.md` -- workflow definitions for slash-style commands
- `.claude/rules/*.md` -- reusable rules and path-scoped constraints
- `.claude/skills/*/SKILL.md` -- on-demand skills and domain procedures

## Command Dispatch

RPI workflows use the installed native skills. For Claude Code, read
`.claude/skills/rpi-<workflow>/SKILL.md`; for Codex, read the matching
`.agents/skills/rpi-<workflow>/SKILL.md`. Read the selected skill and its
references completely before acting. Use `/rpi-plan` in Claude Code or
`$rpi-plan` in Codex for RPI planning; the other RPI workflows follow the
same naming pattern. Native `/plan` and `/status` do not invoke RPI workflows.

Retained project-specific commands in `.claude/commands/` apply only when
explicitly invoked. Their presence does not replace the native RPI skills.
If a workflow references a plan or research artifact, read it completely.

## Claude-to-Codex Translation

The command files are written for Claude Code. In Codex, translate Claude-native behavior to the closest equivalent:

- `/simplify` -- use `codex-simplify` when installed; otherwise perform a dedicated reuse, quality, and efficiency review
- `/batch` -- parallelize only phases explicitly marked `[batch-eligible]`, using isolated worktrees or agents
- `/worktree` or `EnterWorktree` -- use an isolated Git worktree or equivalent workspace
- `Task` / `Explore` agents -- use Codex subagents with the same role separation when the active runtime permits delegation
- `AskUserQuestion` -- ask directly only when repository evidence cannot answer safely
- `/clear` and `/compact` -- treat as context-management guidance

Preserve the methodology even when the harness differs.

## Codex-Only Skills

- Do not define a project skill literally named `simplify`.
- Keep Codex-only helpers outside `.claude/skills/` so they do not shadow Claude-native commands.

## Rules Loading

Always follow `CLAUDE.md`, then load `.claude/rules/` as follows:

- Always read `rpi-details.md` and `push-accountability.md`.
- Apply other rule files when their `paths` frontmatter matches the files in scope.
- A command file governs the workflow; a rule governs local constraints within it.

## Skills

Load a skill when the task matches its description or a command or rule points to it. Skills supplement command workflows; they do not replace them.

## Outputs and Gates

Preserve these cc-rpi locations:

- `docs/research/` -- research documents
- `docs/plans/` -- implementation plans and phase files
- `docs/decisions/` -- architecture decisions
- `docs/agents/` -- operational reports, gitignored because this is intended to be a public repository

Respect the phase gates:

- Stop after research.
- Stop after the plan is finalized and reviewed.
- Stop after each implementation phase unless the user explicitly says to continue.

During research, describe what exists and do not implement improvements.

## Verification and Git

- Run verification specified by the command, plan, or `CLAUDE.md`.
- Keep verification sequential unless the workflow explicitly permits parallel work.
- Use the documented `develop`/`main` topology: PRs target `develop`, releases promote `develop` to `main`, and implementation stays off both.
- Do not create a GitHub repository, push, deploy, change DNS, publish, tag, or release without separate authorization.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
<!-- rpi:push-accountability:start -->
# Push Accountability

Keep working branches and worktrees local. Finish applicable tests, coverage,
typechecks, lint, build and deployment preflight locally, resolve failures,
and integrate completed work locally into the documented integration branch.
Inspect workflow and deployment triggers before the single authorized push of
that completed branch. Never create Vercel Preview deployments or publish
working branches/PRs for experimentation. If an integration push would create a
Preview, stop before pushing and use only a documented, non-destructive bypass.
Production publication remains separately and explicitly authorized. Read-only
inspection of existing runs and deployments is allowed.

Commit or preserve intended changes before pulling; never pull through a dirty
tree. After an authorized push, inspect every expected workflow for the exact
pushed commit. Diagnose failures from existing logs and reproduce/fix locally.
Report the failed remote result; do not trigger reruns or a fix-and-repush loop.
A new remote action needs authorization after the complete local gates pass.
<!-- rpi:push-accountability:end -->
<!-- rpi:rpi-details:start -->
# RPI Details

## Context Management

- Each RPI phase should be its own conversation.
  Preserve their acceptance boundaries unless the user explicitly authorizes
  continuation; a continuation instruction does not remove verification.
- Use `/clear` between unrelated tasks.
  Use `/compact` when context is heavy but the task continues.
- Handoffs record objective, approved scope, base/current commit and worktree,
  findings, decisions, check evidence and tested identity, deviations, risks and
  next phase. On resume, verify actual files, refs and evidence validity before
  relying on the handoff; compaction never grants new authority.
- Subagents are context control mechanisms --
  they search/read in their window and return only distilled results.
- Research and planning happen against the integration branch.
  Implementation happens in worktrees or temporary branches.

## Rules for All Phases

- Read controlling instructions/contracts and directly mentioned files completely.
  Inspect implementation to the depth needed; reuse valid prior reads.
- In `rpi-research`, document what exists without improvement recommendations.
  Use the separate `rpi-assess` workflow for evaluative research and alternatives.
- Every code reference must include file:line.
- Delegate only useful bounded independent assignments within this phase.
  A narrow task may stay with the parent. State objective, permitted actions,
  owned files, evidence/output, resource budget and terminal condition for each
  assignment. Missing required results remain coverage gaps until resolved.
- Never write documents with placeholder values.
- Exhaust all tools before suggesting manual steps --
  check CLI tools, shell commands, MCP servers, and file tools
  before escalating to the user.

## Rules for Implementation

- Follow the atomic loop:
  implement -> independent review -> repair -> simplify -> verify.
  The native simplify command or Codex helper catches code reuse, quality, and efficiency issues
  that the plan-compliance reviewer does not check.
- Independent batch work stays local, one owner per file set/worktree and one
  integration owner. Never use a batch mode that automatically publishes PRs.
  Keep at most three simultaneous implementers; use fewer when the task or
  available resources do not justify three.
- Run ALL automated verification after each phase.
- Stop after each phase for acceptance unless the user explicitly authorizes
  continuation. Finish all authorized phase work before that gate.
- If a technical discovery invalidates the plan contract, record the adjustment
  and explain the impact before dependent work; ask only for a required new decision.

## Pre-Release Workflow

`rpi-pre-launch` -> `rpi-remediate` -> `rpi-update-docs` -> `rpi-release`

After `rpi-pre-launch`, include a simplify pass for reuse, quality and
efficiency. Track its findings with the other audit results; resolve security
and infrastructure findings through the same review, repair and verification
loop. Preserve all required audit domains regardless of staffing.

Resolve every confirmed actionable finding before acceptance. Reject false
positives with evidence. Strategic findings needing a new architectural decision
receive explicit local dispositions and owner review; external issue creation
requires authorization. Never silently discard a finding.

## Testing Philosophy

Prefer automated verification.
Manual only for: sudo, hardware, new installs, visual-only.
Use deterministic linting/formatting tools. Preserve TDD for behavioral code
changes. Run all required phase/final gates locally, sequentially with failure
aggregation; a later success cannot erase an earlier failure. Reuse evidence
only for unchanged tested inputs, never as a substitute for an invalidated gate.
<!-- rpi:rpi-details:end -->
<!-- rpi:rule-map:start -->
## Conditional rule access

Before acting on a matching task/path, read the installed rule body below.
The installation manifest records the selected components and exact mappings.
This root map applies even when a session starts at the repository root and
later edits a nested directory; it is an instruction contract, not a native
Codex glob loader. Sessions started inside a subproject also read their actual
root-to-current-directory instruction chain. Preserve project-specific overrides.

| Task or path | Required resource | Essential constraint |
| --- | --- | --- |
| Deployment, CI, release or infrastructure configuration | `.rpi/rules/deployment-safety.md` | Local gates first; no Vercel Preview; production needs authorization. |
| SQL, Supabase migrations, schema, data access or database tests | `.rpi/rules/supabase.md` | Reset/test locally; privileges and RLS are distinct; remote targets need authorization. |
| Behavioral changes, tests, fixtures and validation | `.rpi/rules/testing.md` | TDD for behavioral code; every required check must run and pass. |
| WebMCP, MCP tools, tool registration or agent-facing interfaces | `.rpi/rules/webmcp.md` | Validate on the server; isolate unstable browser APIs and test caller recovery. |

If a required component is missing, report the exact missing path and run the
read-only installation check before proceeding with dependent work. Never
invent a successful read or silently treat an incomplete install as healthy.
<!-- rpi:rule-map:end -->
