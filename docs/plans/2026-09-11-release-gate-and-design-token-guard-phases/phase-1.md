# Phase 1 — Orphaned design tokens: guard and the two live fixes `[batch-eligible]`

Parent: [plan](../2026-09-11-release-gate-and-design-token-guard.md)

Closes the class of defect that shipped in v1.3.0, and repairs the two instances
that are live in production right now.

## Files

| File | Action |
| --- | --- |
| `src/components/runs/run-status.module.css` | edit |
| `src/components/runs/run-timeline.module.css` | edit |
| `src/app/globals.css` | edit |
| `src/components/design-tokens.test.ts` | new |
| `tests/e2e/run-status-styling.spec.ts` | new |

No overlap with phases 2 or 3.

## Step 1 — Move the `--run-*` aliases to `:root`

`run-status.module.css:1-8` currently opens:

```
.shell {
  --run-paper: var(--paper, #f4f0e7);
  --run-sheet: var(--sheet, #fffdf7);
  --run-ink: var(--ink, #171b1a);
  --run-muted: var(--graphite, #5d625f);
  --run-teal: var(--teal, #0c615b);
  background: var(--run-paper);
  ...
```

Apply the same shape as the v1.3.1 fix (`globals.css`, the `--guest-*` block):

```
globals.css, after the seasonal blocks:
  :root {
    --run-paper: var(--paper)
    --run-sheet: var(--sheet)
    --run-ink:   var(--ink)
    --run-muted: var(--graphite)
    --run-teal:  var(--teal)
  }
  # comment: why these live on the document — RunStatusPoller and RunTimeline
  # render both inside the run-status page's .shell and inside the host
  # dashboard's capture form, which has no .shell ancestor.

run-status.module.css:
  .shell { REMOVE the five --run-* declarations; keep background/color/layout }
```

Every override of `--paper`/`--ink`/`--teal` is on `<html>`
(`globals.css:33-57`, `:481-537`), the same element as `:root`, so the aliases
follow season and theme. This is the property that made the guest fix correct;
it holds identically here.

## Step 2 — Give `run-timeline` real tokens

`run-timeline.module.css` reads `--run-ink`/`--run-muted` with hardcoded
fallbacks (`:3`, `:18`, `:24`, `:39`, `:47`). After step 1 the tokens resolve, so
the fallbacks become dead code that would mask a future regression.

```
run-timeline.module.css:
  var(--run-ink, #171b1a)  -> var(--run-ink)
  var(--run-muted, #5d625f) -> var(--run-muted)
```

Removing the fallback is deliberate: it converts a future orphaning from a
silent wrong-colour into a visible break, and the guard in step 3 catches it
before it ships either way.

## Step 3 — The static guard

New `src/components/design-tokens.test.ts`. Precedent for reading CSS in the
vitest suite: `src/components/frontend-boundaries.test.tsx:1,120`.

```
GLOB every src/**/*.module.css   # glob, not an enumerated list, so new modules
                                 # are covered the day they are added

root = parse src/app/globals.css
       collect --props declared under any selector containing ":root"
       or starting with "html"

ALLOW = {
  # injected at runtime by next/font on a wrapper element
  --font-fraunces, --font-inter, --font-jetbrains-mono,
  # element-scoped by design: value varies per instance, declared and read
  # on the same element (room-ledger .door)
  --door-state,
}

for each module:
  declared = --props declared anywhere in this module
  scopedNonRoot = declared whose selector is not :root
  read = every var(--x) reference

  FAIL if read ∩ scopedNonRoot is non-empty and not in ALLOW
    -> "<file> reads <token> but declares it on <selector>. A wrapper-scoped
        token resolves to an invalid var() wherever that wrapper is absent,
        and CSS then falls back to the property's initial value — silently.
        FIX: declare it on :root in globals.css."

  FAIL if (read - declared - root - ALLOW) is non-empty
    -> "<file> reads <token>, which nothing declares at :root."

ASSERT len(ALLOW) == 4   # the allow-list may not grow without a deliberate edit
```

Each `ALLOW` entry carries the inline comment shown above. The test must name
the offending file and token — a failure that says only "expected true to be
false" is not a guard, it is a puzzle.

## Step 4 — Mutation check (proves the guard works)

A guard that has never failed is unproven. Verify by hand during implementation,
and record the result in the PR body:

1. Temporarily move one `--run-*` declaration back under `.shell`.
2. `pnpm run test` → the design-tokens test must fail, naming that file and token.
3. Revert.

## Step 5 — Browser proof for the live fix

New `tests/e2e/run-status-styling.spec.ts`. Follow the existing host-cookie
pattern (`tests/e2e/guided-demo.spec.ts:19-27`) to reach the host dashboard,
submit a capture, and wait for the poller (`expectRunStatus` in
`tests/e2e/helpers/async-actions.ts:26-35`).

```
assert on the poller card and pulse dot, via getComputedStyle:
  card.backgroundColor  != "rgba(0, 0, 0, 0)"
  card.borderTopWidth   != "0px"
  pulse.backgroundColor != "rgba(0, 0, 0, 0)"
```

Assert categorical differences only — a colour versus transparent, a width
versus zero — never exact colour values, which vary by season and theme.

This is the assertion shape that would have caught v1.3.0; JSDOM cannot, because
it does not resolve custom properties.

## Success criteria

**Automated**

- `pnpm run test` passes; `design-tokens.test.ts` reports zero offending modules.
- `pnpm run test:e2e` passes, including `run-status-styling.spec.ts`.
- `pnpm run typecheck`, `pnpm run lint`, `pnpm run build`,
  `bash scripts/verify-bootstrap.sh` pass.

**Manual**

- Step 4's mutation check performed, result stated in the PR body.
- The host dashboard capture flow looked at in a browser in both light and dark:
  the poller card has a visible border and background, the pulse dot is visible,
  and the timeline text is legible against the dark background.
