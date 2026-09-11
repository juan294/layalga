# Plan: production release gate and the orphaned-design-token guard

Date: 2026-09-11
Status: implemented
Source: two open items carried out of the v1.3.1 release, recorded in
[the release playbook](../release/e2e-pro-playbook.md) historical decisions.

## Why this plan exists

Two gaps came out of v1.3.1, and researching the second one found that it is
not a gap but a live defect with two more instances in production.

**Item 1 — the production probe gate has not run for three releases.**
v1.2.1, v1.3.0 and v1.3.1 all shipped without `pnpm run demo:e2e` +
`pnpm run release:probes` executing against production, because the operating
environment's permission classifier blocks getting the production web-role
`DATABASE_URL` into a shell. Each release substituted `/api/health` identity,
an AgentCore smoke run, and direct browser checks.

**Item 2 — a class of CSS defect that ships silently.** v1.3.0 put visibly
broken guest panels into production with every automated check green. A CSS
module declared its design tokens on a wrapper class, a restructure removed the
wrapper, and every rule reading those tokens resolved to an invalid `var()` —
which CSS treats as guaranteed-invalid, so each property silently falls back to
its initial value. Nothing in the pipeline renders a page, so nothing failed.

## Verified findings

Everything in this section was read or executed in the planning session.
`file:line` is cited for each claim.

### The probe gate is exercised, but never against production

| Fact | Evidence |
| --- | --- |
| CI runs both scripts on every PR and push | `.github/workflows/ci.yml:141-142` |
| Always against the job's own server, never remote | `--base http://127.0.0.1:3008` at `ci.yml:141,142`; `APP_URL` at `ci.yml:82` |
| `--commit` is never passed, so the identity assert is skipped | `ci.yml:141-142`; guard at `scripts/release-probes.ts:253-264` |
| `--expect-runtime`, `--expect-email`, `--expect-memory` never passed | `ci.yml:75-86` sets no `EMAIL`/`MEMORY`; defaults at `scripts/release-helpers.ts:105-106` |
| CI env values are committed dummies, not secrets | `ci.yml:75-86` |
| The repo has **no** Actions secret, **no** `workflow_dispatch`, **no** environments | `grep -rn "environment:\|workflow_dispatch\|secrets\." .github/workflows/` returns nothing |

So the probes themselves are continuously proven against a real build and a real
Postgres. What has never happened is a run **bound to a production candidate**
with the three assertion flags on.

### The probes cannot be made database-free

| Probe | Database use | Evidence |
| --- | --- | --- |
| 4 (concurrency) | **writes** — inserts a whole throwaway home, rooms, hosts, two parties, two invitations | `scripts/release-probes.ts:398-451` |
| 9 / `finally` (cleanup) | **writes** — deletes tagged artifacts, reseeds the demo home, and rewrites `parties.link_token` hashes | `scripts/release-probes.ts:710-735`, `:199-227` |
| 2, 3, 5 | reads over `runs`, `invitations`, `visits`, `audit_events`, `pending_decisions` | `:95-105`, `:367-390`, `:635-663` |

Replacing this with HTTP endpoints would mean adding a privileged admin mutation
surface to production. That is a worse security posture than the problem, and it
contradicts the product safety contract that the database is authoritative and
not model-mutable. **Rejected.**

Required environment, all four checked before any probe runs
(`scripts/release-probes.ts:79-82`): `DATABASE_URL`, `LINK_TOKEN_SECRET`,
`AGENT_ROUTE_SECRET`, `TICK_SECRET`. `LINK_TOKEN_SECRET` must equal the target
deployment's value because cleanup rewrites hashed guest tokens
(`:727-733`).

Blast radius is bounded: the demo reset deletes on exact id **and** exact name
**and** `demo = true` (`src/lib/demo/reset.ts:190-195`). Real household data
cannot be touched by a probe run.

Configuration can come from the environment instead of flags —
`EXPECTED_COMMIT_SHA`, `EMAIL=ses`, `MEMORY=agentcore`
(`scripts/release-helpers.ts:101-106`). Only `--expect-runtime` has no
environment equivalent (`:131-141`).

### The orphaned-token defect has two more live instances

A detection prototype run during planning over every `*.module.css` found:

| Module | Tokens | Failure mode | Rendered where |
| --- | --- | --- | --- |
| `src/components/runs/run-status.module.css:2-6` | `--run-paper/sheet/ink/muted/teal` declared on `.shell`; consumers read them bare, e.g. `:33` `border: 1px solid var(--run-ink)`, `:56` `background: var(--run-sheet)`, `:71` `background: var(--run-teal)` | **Catastrophic** — invalid `var()` → initial value: no card background, no border, invisible pulse dot | `src/components/host/capture-invitation-form.tsx:213`, which has no `.shell` ancestor |
| `src/components/runs/run-timeline.module.css:3,18,24,39,47` | reads `--run-ink`/`--run-muted`, declares neither, but uses `var(--x, #hex)` fallbacks | **Quiet** — falls back to a hardcoded light-theme hex, so dark mode renders grey on near-black | same component tree |

Both were confirmed by driving a real invitation capture on the host dashboard
in a browser and looking at the result: the poller card had no border or
background and the pulse dot was invisible.

The distinction matters for the fix: `var(--x)` with no fallback fails
catastrophically; `var(--x, #hex)` fails quietly to a wrong colour. Neither is
caught by any existing check.

Two patterns the guard must **not** flag:

- `--font-fraunces`, `--font-inter`, `--font-jetbrains-mono` — injected at
  runtime by `next/font` on a wrapper element, legitimately absent from
  `globals.css`.
- `--door-state` and the `--state-*` reads in
  `src/components/host/room-ledger.module.css` `.door` — a deliberate
  per-element token whose value varies per instance, declared and read on the
  same element.

### Rendering `GuestVisitRecord` needs no seed change

`GuestVisitRecord` (`src/components/guest/guest-visit-record.tsx`) is an async
server component taking a `visit` object. Its states: the fact list always;
notes; `.sharedNote` on overlap; `.chase` on `reconfirm_pending`; `.holdNotice`
for hold active/expired; and `GuestActions` when `presentation.canChange`.
`cancelled` renders the same body minus the actions, with the title and stamp
differing in the shell (`src/components/guest/guest-shell.tsx:88`).

`tests/e2e/guest-email.spec.ts:16-59` already establishes the pattern this needs:
a spec that opens its own `postgres` client, inserts an isolated
`demo:false` home, host, party and invitation, inserts a `visits` row **directly
at the wanted status**, and returns a `cleanup()` that deletes the home.

This is why **`DEMO_SEED` is not touched by this plan**: an isolated fixture
cannot collide with probe assertions, cannot change demo baselines, and cannot
alter what a judge sees in the demo. No test renders `GuestVisitRecord` today
(`grep -rln GuestVisitRecord src/ tests/` returns only the component and the two
pages that use it).

Playwright guest sign-in has three existing mechanisms; the cheapest for a
fixture-owned invitation is the token URL, as in `tests/e2e/guest-link.spec.ts:18`.

### A JSDOM render test cannot catch this class

JSDOM does not resolve custom properties, so a structure or snapshot test would
have passed happily through the v1.3.0 breakage. Render coverage for this class
must run in a real browser and assert **computed styles** — `backgroundColor`
is not `rgba(0, 0, 0, 0)`, `borderTopWidth` is not `0px`. That encodes the exact
failure mode and is far more stable than pixel snapshots.

## Decisions taken

| Decision | Choice | Rationale |
| --- | --- | --- |
| How to run probes against production | Manually dispatched GitHub Actions job | The secret never enters a local shell, so the classifier is never involved; evidence becomes a CI run URL |
| Secret posture | Four narrow secrets in a protected environment | Least privilege — each secret does one thing, none can deploy or rewrite config. Rejected: a single `VERCEL_TOKEN` pulled at runtime, which stays in sync but grants redeploy and full env read/write across the project |
| Scope of the token work | Guard + fix both live bugs + browser render coverage | Repairs what is broken today and stops the fourth instance. Rejected: fixing the two bugs alone (class stays open); rejected: purging ancestor tokens from every module (large diff across modules unrelated to the defect) |
| Demo seed | Unchanged | The isolated-fixture pattern already exists and avoids every collision |

## Phases

All three phases are independent — no shared files, no phase consuming another's
output — so `/batch` can run them in parallel, one worktree per phase.

| Phase | Title | Files | Batch |
| --- | --- | --- | --- |
| 1 | [Orphaned design tokens: guard and the two live fixes](2026-09-11-release-gate-and-design-token-guard-phases/phase-1.md) | `src/components/runs/*.module.css`, new `src/components/design-tokens.test.ts`, new `tests/e2e/run-status-styling.spec.ts` | `[batch-eligible]` |
| 2 | [GuestVisitRecord confirmed and cancelled render coverage](2026-09-11-release-gate-and-design-token-guard-phases/phase-2.md) | new `tests/e2e/guest-visit-record.spec.ts` | `[batch-eligible]` |
| 3 | [Production probe gate as a dispatched workflow](2026-09-11-release-gate-and-design-token-guard-phases/phase-3.md) | new `.github/workflows/production-probes.yml`, `docs/release/e2e-pro-playbook.md` | `[batch-eligible]` |

## Success criteria

### Automated

- `pnpm run test` passes, including the new `design-tokens` test.
- The new token test **fails** when a token is deliberately moved back onto a
  wrapper selector, and the failure message names the file and the token
  (mutation check, specified in phase 1).
- `pnpm run test:e2e` passes, including the new computed-style specs.
- `pnpm run typecheck`, `pnpm run lint`, `pnpm run build`,
  `bash scripts/verify-bootstrap.sh` all pass.
- CI green on each phase's PR.

### Manual

- Four repository secrets created and a protected `production-probes`
  environment configured with a required reviewer. This is the product owner's
  action; it cannot be scripted from here and phase 3 is not complete without it.
- One dispatched production probe run against the current production commit
  completes with all nine probes passing, and its run URL is recorded in the
  playbook — retiring a follow-up that is now three releases old.
- The host dashboard capture flow is looked at in a browser, in both themes,
  and the poller card and pulse dot are visibly present.

## Risks

| Risk | Mitigation |
| --- | --- |
| A dispatched probe run resets the production demo home mid-demonstration | Manual dispatch only, gated on a protected environment with a required reviewer; the workflow's summary states the blast radius; never scheduled |
| Production credentials now exist in GitHub Actions | Four narrow secrets rather than a deploy-capable token; environment-scoped so only the gated job can read them; rotation noted in the runbook |
| The token guard's allow-list becomes a dumping ground | Each entry requires an inline comment stating why the token is element-scoped; the test asserts the allow-list stays at its documented size |
| Computed-style assertions prove flaky across browsers | Assert only on properties whose broken value is categorically different (transparent vs a colour, `0px` vs a width), never on exact colour values |

## Out of scope

- Changing `DEMO_SEED` or anything a judge sees in the demo.
- Refactoring CSS modules that are not currently defective.
- Any change to what the nine probes assert.
- Automatic or scheduled production probe runs.
