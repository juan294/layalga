# Phase 2 — `GuestVisitRecord` confirmed and cancelled render coverage `[batch-eligible]`

Parent: [plan](../2026-09-11-release-gate-and-design-token-guard.md)

Closes the verification gap left by v1.3.1: the confirmed and cancelled guest
panels have never been seen rendered, so the token fix is only inferred to cover
them.

## Files

| File | Action |
| --- | --- |
| `tests/e2e/guest-visit-record.spec.ts` | new |

No overlap with phases 1 or 3. `DEMO_SEED` is deliberately not touched.

## Step 1 — Isolated fixture

Copy the established pattern from `tests/e2e/guest-email.spec.ts:16-59` rather
than inventing one. It inserts its own `demo:false` home so nothing it does can
collide with probe assertions, demo baselines, or what a judge sees.

```
fixture(status):
  db = postgres(DATABASE_URL, { prepare: false, max: 2 })
  ids = five randomUUIDs
  token = randomUUID()

  insert homes      (demo: false, name: "Guest visit record test")
  insert hosts
  insert parties
  insert invitations(link_token: hashLinkToken(token, LINK_TOKEN_SECRET),
                     link_token_expires_at: now() + 60 days)
  insert visits     (stay: daterange(current_date+3, current_date+6, '[)'),
                     adults: 2, children: 0, pets: 1,
                     status: <status>)          # the whole point: seed the
                                                # terminal state directly
  return { token, cleanup: () => delete from homes where id = <homeId> }
```

Reach the page by token URL, as `tests/e2e/guest-link.spec.ts:18` does —
the fixture owns the token, so no cookie or demo session is involved.

Run `cleanup()` in `afterEach` so a failing assertion cannot leave rows behind.

## Step 2 — Assert the states render

Two cases, `confirmed` and `cancelled`. From the research, both render the same
body — the fact list, plus notes/overlap when present — and differ in the shell
title and stamp, and in whether `GuestActions` appears
(`src/components/guest/guest-visit-record.tsx:82-90`,
`src/components/guest/guest-shell.tsx:88`).

```
confirmed:
  status stamp shows the confirmed label
  fact list present: guest-room-count, guest-room-labels testids
                     (guest-visit-record.tsx:43,47)
  GuestActions present

cancelled:
  status stamp shows the cancelled label
  fact list present
  GuestActions absent
```

Assert on `data-testid` and roles, not on copy, so translation edits do not
break the spec.

## Step 3 — Computed-style assertions (the part that catches the real bug)

Structure assertions would have passed straight through the v1.3.0 breakage.
Add, in the browser:

```
factList dt/dd:   borderBottomWidth != "0px"     # .factList rule, guest-ledger.module.css:308-313
panel card:       backgroundColor   != "rgba(0, 0, 0, 0)"
                  borderTopWidth    != "0px"
confirmed only:
  GuestActions primary button:
                  backgroundColor   != "rgba(0, 0, 0, 0)"
                  color             != the button's own backgroundColor
```

The last assertion is the precise statement of the v1.3.0 failure: the button
had lost both its fill and its contrasting text colour, leaving mono text on
paper. Categorical comparisons only — never exact colour values, which vary by
season and theme.

## Step 4 — Look at it

The plan's whole premise is that automated checks do not see appearance. Run the
guest page for both states in a real browser during implementation, in light and
dark, and compare against `design_handoff_signed_in_shell`. State in the PR body
what was seen — this is the step that was skipped in v1.3.0.

## Success criteria

**Automated**

- `pnpm run test:e2e` passes, including both new cases.
- The spec leaves no rows behind: after the run, no home named
  `Guest visit record test` remains.
- `pnpm run typecheck`, `pnpm run lint` pass.

**Manual**

- Both states looked at in a browser, both themes, and confirmed against the
  design handoff. Stated in the PR body.
