# Phase 5: Strands Coordination and WebMCP Preparation

## Goal

Let the coordinator and browser agents do the repetitive room work while visible human confirmation remains the write boundary.

## Files

- Extend `src/agent/task.ts`, authority, prompts, tools, tool registry, policy hook, and safety tests.
- Add host room-request task and durable proposal operations.
- Add `src/components/webmcp/` registration adapters and tests.
- Wire host and guest pages to invitation-scoped or host-scoped preparation callbacks.

## Red tests

- Host room request produces one home-scoped proposal and cannot apply it.
- Guest task authority overrides model-supplied room IDs and overflow consent.
- Overflow selection interrupts, rechecks after approval, and applies exactly once.
- Agent runtime cannot read private notes or calendar capabilities.
- WebMCP schemas contain no home, host, or invitation authority fields.
- Read results are bounded and marked read-only/untrusted; preparation changes visible state and performs no write.
- Registration safely no-ops when WebMCP is absent and unregisters on cleanup.

## Implementation

- Add tools to list guest-safe rooms, find room options, and prepare a private block or availability change.
- Keep block/open/close application outside model tools.
- Add `roomIds` and `acceptOverflow` to trusted guest submission authority and gated hold/reschedule calls.
- Extend policy interrupts with exact room labels and overflow arrangements, then re-read before resume.
- Register host tools for reading availability and preparing block/open/close forms.
- Register guest tools for reading options and preparing the visible booking form.
- Feature-detect `document.modelContext`, use narrow JSON schemas, bounded output, and `AbortController` cleanup.

## Verification

```bash
pnpm exec vitest run --maxWorkers=1 --no-file-parallelism src/agent src/components/webmcp
pnpm run agent:bundle
pnpm run typecheck
pnpm run lint
pnpm run build
```

## Done when

- [x] Agent and WebMCP red tests pass.
- [x] Existing authority, tenant, interrupt, and run-safety tests pass.
- [x] No model or browser tool can commit a room write without visible confirmation.
- [x] Plan-compliance review approves the agent-first boundary.
