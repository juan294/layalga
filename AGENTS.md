# Project: L’Ayalga

## Codex Compatibility

This project follows the cc-rpi methodology and is configured to work with both Claude Code and Codex / GPT-5.x.

When operating in Codex, treat these files as the source of truth:

- `CLAUDE.md` -- project overview, workflow, commands, git, deployment, and safety contracts
- `.claude/commands/*.md` -- workflow definitions for slash-style commands
- `.claude/rules/*.md` -- reusable rules and path-scoped constraints
- `.claude/skills/*/SKILL.md` -- on-demand skills and domain procedures

## Command Dispatch

When the user invokes a slash-style workflow such as `/brainstorm`, `/research`, `/plan`, `/implement`, `/validate`, `/pre-launch`, `/update-docs`, `/release`, `/fix-ci`, `/describe-pr`, or `/status`:

1. Check for the matching file in `.claude/commands/`.
2. Read that command file completely before acting.
3. Follow it as the workflow specification for this task.
4. Keep outputs in the repository locations required by that command.

If the command references a plan or research path, read that document fully before doing anything else.

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
