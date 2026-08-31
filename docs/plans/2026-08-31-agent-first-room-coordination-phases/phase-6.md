# Phase 6: Demo Proof, Documentation, and Full Validation

## Goal

Turn the implementation into one coherent hackathon proof and verify every acceptance criterion locally.

## Files

- Extend synthetic demo reset, E2E driver, Playwright tests, and release probes.
- Update README, privacy/security documentation, demo script, and architecture notes.
- Record any plan deviations in the required plan notes file.

## Red proof

The demo E2E must initially fail on a scenario that:

1. creates a private-room proposal from a host message;
2. confirms the proposal and observes the room leave guest options;
3. opens the withheld synthetic room for a date range;
4. lets a guest choose multiple exact rooms;
5. pauses an overflow request for host approval and resumes once;
6. reads the calendar feed and proves private data is absent.

## Implementation

- Add deterministic demo fixtures and clock-safe dates.
- Add a WebMCP registration proof that does not depend on browser support for the experimental API.
- Update product docs to explain the real-room setup boundary and the intentional privacy change: a guest sees its own assigned guest-visible room labels, never hidden rooms or other guests.
- Document Telegram and remote MCP as follow-ons, not implemented channels.
- Do not copy private house sources into Git or the demo.

## Final verification

Run sequentially:

```bash
supabase db reset
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run build
pnpm run test:e2e
pnpm run demo:e2e
pnpm run release:probes
bash scripts/verify-bootstrap.sh
supabase db lint --local --level warning
git diff --check
```

## Manual verification

- Inspect host room ledger on desktop and narrow mobile widths in English and Spanish.
- Inspect guest exact-room and overflow consent flow with keyboard only.
- Inspect calendar import in a local calendar parser; subscribing a real family calendar is outside this local implementation authorization.

## Done when

- [x] Full sequential verification passes.
- [x] Simplify finds no remaining material reuse, quality, or efficiency issue.
- [x] Final plan-compliance review approves every automated and manual criterion that can be completed locally.
- [x] No push, remote migration, deploy, tag, release, or live calendar subscription has occurred.
