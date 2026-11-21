# Phase 1 · Find the household and compare real stays

**Outcome.** A first-time guest can find L’Ayalga by name and find feasible rooms for a continuous stay. Searching needs neither a login nor action from a host.

## Implementation

1. Give a household a public listing with a stable public handle and an explicitly published display name. Match case, whitespace and straight/curly apostrophes in a bounded name search. Return selectable matches if ambiguous. Existing homes start unlisted. Provide a one-time setting for an authenticated host to publish or unpublish their own household. Only published homes participate in discovery or public availability. Exercise this with fixture households locally.
2. Extract the date-window enumeration from `src/core/booking/guest-actions.ts:84`. Retain its invitation wrapper and preference lookup. A separate public entry point resolves the listing, loads the same room ledger and uses neutral preferences. Reuse the existing rules for standard and overflow capacity, pets, children and full-stay occupancy. Reject past starts in household-local time and invalid windows. Bounds and ranking are defined at `src/core/booking/option-window.ts:5`, `src/core/rooms/search.ts:81` and `src/core/rooms/recommendation.ts:22`.
3. Limit results to stay dates, guest-visible room labels and features, capacities, relevant overflow terms and the suggested selection. Use listing-scoped option references that resolve only to a selection the server can validate again. Exclude guest identity, stay/overlap history, raw ledger state, private block reasons, host whereabouts and party memory. The invited projection at `src/core/booking/guest-room-contract.ts:3` and internal window at `src/core/rooms/search.ts:143` serve different audiences.
4. Offer bilingual search and comparison in the public guest view. On a supported browser, register tools for actual household lookup and availability search using the existing page-lifecycle adapter at `src/components/webmcp/register-tools.ts:3`. Return enough information to refine a search conversationally. Keep the form usable if registration fails. Each option states that the host makes the final decision.

```text
@ searchPublicStays(listing, window, nights, party) -> options
ctx: household clock and availability ledger
do:
  1. resolve published household
  2. validate window and party
  3. compute feasible whole-stay room sets
  4. emit public choices and the latest checkout date
fail: unknown listing or empty result -> show discovery or editable criteria
```

## Acceptance

**Automated.** Use two isolated fixture homes and no pre-created party for the first guest. A request for two adults and 14 nights within July returns only contiguous 14-night options with the same rooms throughout. A closure on night seven removes that room for that stay. Test household-local dates, same-day turnover, withheld openings, standard and overflow fit, occupied and expired holds, ambiguous names, no results, pagination or a clear bounded-result indicator, and absence of any guest-specific memory call. Fetching a previously returned option after unpublishing must fail. Compare the invited wrapper with existing clock and preference tests. Assert exact public response keys and no write of requests or occupancy.

**Manual.** On mobile and desktop, compare two options in each language. A guest can understand the room difference, that checkout ends the stay, and that the host still needs to confirm. The web form works without WebMCP. Record native WebMCP evidence separately from an injected browser registry.

**Coordination.** Implement the shared search contract before its consumers. One integration owner for this phase.
