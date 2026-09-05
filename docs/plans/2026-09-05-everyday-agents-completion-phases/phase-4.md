# Phase 4: Preference-informed recommendations

Plan: `2026-09-05-everyday-agents-completion`. Depends on phase 3.

- [ ] Add trusted party-scoped preference retrieval using the existing injectable AgentCore memory client.
- [ ] Normalize bounded supported preferences and match only verified guest-safe room facts; detect conflicting/unusable memory.
- [ ] Rank feasible standard/overflow options using preferences without bypassing policy or guest consent.
- [ ] Wire actual guest search and applicable agent tools; return readable explanations in English/Spanish.
- [ ] Retain explicit choice and safe missing-memory fallback; no fabricated accessibility guarantees.
- [ ] Test that a returning two-adult family preference changes the recommended room, other-party memory is excluded and unavailable preference is explained.
- [ ] Compliance/quality reviews and sequential local verification complete.

Pseudocode: authorized_party -> bounded memory records -> supported preference evidence; feasible rooms := deterministic availability; recommendation := rank(feasible, capacity, preferences); explain matched preference or fallback; guest confirms exact rooms.
