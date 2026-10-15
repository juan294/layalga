# Phase 4: documentation and hackathon archive `[batch-eligible]`

Parent: [plan](../2026-10-15-real-use-launch.md)

Documentation only. No file overlap with phase 3, so it can run in its own worktree beside phase 3 with one integration owner. Write the final wording after phase 2, because the runbooks name the new probe set.

## Files

| File | Change |
| --- | --- |
| `docs/submission/*` | `git mv` to `docs/archive/hackathon/`; add `docs/archive/hackathon/README.md` stating that these files describe the judged demo as of 2026-10-14 and are not current behaviour |
| `CLAUDE.md` | Remove the judge-guide "Repository review" section and demo references (`:31,45,72,77,94`); describe Google sign-in, the converted household, the new production gate and the two-release schema removal |
| `AGENTS.md` | Remove the judge-guide and evidence-index pointers; keep the Codex compatibility content |
| `README.md` | Replace the four-beat demo (`:36-45`), demo env (`:157-158`), demo buttons (`:168-170`) and later demo references (`:185-217`) with real-use setup: Google OAuth credentials, host claims, local development with `signInAsHost` |
| `CONTRIBUTING.md:27` | Remove the demo instruction |
| `docs/guides/host-manual.md` | Replace section 10 "Guided demo and recovery" (`:75-79`) and the demo notes (`:9-15`) with: signing in with Google, adding a second host (a claim row), adding rooms on an empty household |
| `docs/guides/guest-manual.md:22` | Remove the demo note |
| `docs/security/data-lifecycle.md:48,52` | Retention applies to every household; no demo exemption (after phase 6) |
| `docs/release/e2e-pro-playbook.md` | Replace the demo e2e and nine-probe gate (`:23-208`) with the local and production probe targets, the `WRITE PROBE FIXTURE` acknowledgement and `--cleanup-only` |
| `docs/release/runtime-database-and-identity.md:102` | Hosts belong to the real household; describe claim rows |
| `docs/release/guest-email-readiness.md:15` | Remove the demo-home exemption |
| `docs/architecture/README.md:61` | Remove the demo clock and demo session from the description |
| `docs/roadmap.md:16-26` | Mark the hackathon period closed; add the real-use launch |
| `docs/README.md` | Index entries for the archive, this plan and the research |
| `CHANGELOG.md` | Entry for the release that ships phases 1 to 4 |

Dated documents in `docs/research/` and `docs/plans/` are history and stay unchanged.

## Acceptance

Automated:
- `grep -rniE "demo mode|DEMO_MODE|enter as host|guided demo|synthetic demo|judge" README.md CLAUDE.md AGENTS.md CONTRIBUTING.md docs/guides docs/release docs/security docs/architecture docs/roadmap.md` returns nothing that describes current behaviour.
- Every relative link in changed Markdown files resolves (the same link check the docs index uses, or `grep -o "](\.[^)]*)"` with a file existence check).
- `bash scripts/verify-bootstrap.sh` passes.

Manual: the owner reads the host manual's new sign-in and room sections.

## Implementation handoff (2026-10-15)

Status: complete. Written by a separate agent in worktree `layalga-real-use-docs` (branch `docs/real-use-launch`, `9c89b3f`), merged into `feat/real-use-launch` as `64b7866`, corrected after review in `73184cb`.

- [x] Every row of the Files table; `docs/submission/` moved to `docs/archive/hackathon/` with a README; `public/llms.txt` and `.github/copilot-instructions.md` also stopped pointing at the archived judge material.
- [x] Acceptance: grep hits are history or transition text only; relative links in 33 changed files resolve; `bash scripts/verify-bootstrap.sh` passes.
- Review: CHANGES REQUIRED (1 major, 4 minor, 1 nit), all fixed; see the notes file (P4-R1 to P4-R6). Mermaid diagrams re-rendered; the draw.io view stays marked stale on the roadmap.
- Manual (owner): read the host manual's sign-in and room sections.
