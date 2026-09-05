# Phase 4: Preference-informed recommendations

Plan: `2026-09-05-everyday-agents-completion`. Depends on phase 3.

- [x] Add trusted party-scoped preference retrieval using the existing injectable AgentCore memory client.
- [x] Normalize bounded supported preferences and match only verified guest-safe room facts; detect conflicting/unusable memory.
- [x] Rank feasible standard/overflow options using preferences without bypassing policy or guest consent.
- [x] Wire actual guest search and applicable agent tools; return readable explanations in English/Spanish.
- [x] Retain explicit choice and safe missing-memory fallback; no fabricated accessibility guarantees.
- [x] Test that a returning two-adult family preference changes the recommended room, other-party memory is excluded and unavailable preference is explained.
- [x] Compliance/quality reviews and sequential local verification complete.

Pseudocode: authorized_party -> bounded memory records -> supported preference evidence; feasible rooms := deterministic availability; recommendation := rank(feasible, capacity, preferences); explain matched preference or fallback; guest confirms exact rooms.

## Verification evidence (2026-09-05)

Independent compliance and quality reviews approved the scoped recall, ranking, actual guest search and Strands tool integration, and bilingual explanation. Review reproduced and corrected common English/Spanish negations and uncertain or conditional statements that could otherwise become positive preferences.

Local verification passed 616 tests across 122 files, 19 desktop/mobile browser journeys, typecheck, lint, production web build, AgentCore bundle build and bootstrap. Unit coverage ran 463 tests: statements 43.15%, branches 42.71%, functions 44.45%, lines 43.97%.

The integration evidence uses synthetic records through the same injectable memory client interface used by AgentCore. It proves that a returning party of two adults gets a different room recommendation, another party is isolated, a withheld preference is explained, insufficient capacity still denies the option, and the actual Strands room tool follows the same scoped recommendation. It does not establish that this revision has been deployed or that real guest preferences were retrieved in production.

All nine local scripted release probes passed, including the full demo driver. No AWS memory calls, real email, hosted CI or deployments were triggered.
