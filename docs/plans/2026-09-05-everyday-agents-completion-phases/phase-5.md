# Phase 5: Host focus and reliable demo

Plan: `2026-09-05-everyday-agents-completion`. Depends on phase 4.

- [ ] Render host decisions/capture/current outcomes before room administration, retaining room and calendar workflows.
- [ ] Simplify secure post-capture handoff; useful no-work/empty states and plain explanations of next human action.
- [ ] Add guided labeled synthetic scenario with clear routine-success, exception and follow-through steps; avoid shared-state assumptions or invented history/memory.
- [ ] Add semantic demo clock advancement to next eligible chase/escalation, with no-work and repeated-action feedback.
- [ ] Use household-clock-relative fallback dates; replace expiring fixed demo access contracts with bounded valid seeded links.
- [ ] Align exact scenario inputs with available room capacity and invitation/guest routes.
- [ ] Verify guest/host desktop and mobile flows in both languages, semantic clock for Otero and later dates, repeated entry and empty states.
- [ ] Compliance/quality reviews and sequential local verification complete.

Pseudocode: next_action := earliest eligible scheduled job for requested semantic kind; if absent show no eligible work; warp >= current time and due/available time; run normal tick. Guide steps link to actual controls and state; never fabricate completed outcomes.
