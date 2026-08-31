# Agent-First Room Coordination Plan Deviations

## Deviations

### Non-demo legacy room backfill

- Plan said: Backfill every existing room as available with placeholder guest metadata for compatibility.
- Found: That would expose an unknown non-demo room to guest allocation without host-confirmed floor or sleeping details, which conflicts with the plan's fail-closed inventory rule.
- Chose: Backfill identified synthetic demo rooms as available. Keep non-demo legacy rooms as draft, preserve their standard and maximum capacity, and preserve existing occupancy identities.
- Why: Unknown real inventory must remain unavailable until a host completes it. A dedicated migration-upgrade test now proves that the actual migration preserves a legacy room and occupancy while leaving the room draft.

### Guest-safe agent inventory split

- Plan said: `list_guest_rooms` and `find_room_options` resolve guest-safe room facts for a host room request.
- Found: A date-free list cannot truthfully claim that a room is available for a specific stay. It must also expose withheld rooms so the host can prepare an opening proposal.
- Chose: `list_guest_rooms` returns bounded active guest-safe inventory, including rooms withheld by default. `find_room_options` remains the date- and capacity-aware operation.
- Why: This keeps the two tools truthful and lets the coordinator prepare both private blocks and availability controls without revealing private notes.

### WebMCP overflow boundary name

- Plan said: Canonical booking authority carries `overflowConsent`.
- Found: The browser preparation contract benefits from an imperative name that states what the visible checkbox does.
- Chose: WebMCP accepts `acceptOverflow` only at its page boundary and maps it to the visible `overflowConsent` form field. The trusted task and booking services keep `overflowConsent` as the canonical field.
- Why: The alias does not cross the authority boundary and WebMCP still cannot submit the form.

### Experimental WebMCP proof

- Plan said: Add a registration proof that does not depend on browser support for the experimental API.
- Found: The bundled test browsers do not provide `document.modelContext` natively.
- Chose: Playwright installs a narrow page-start test double, verifies the exact registered tools, executes them, and proves they only prepare visible form state.
- Why: This tests the real registration and cleanup path without claiming native browser availability.

### Explicit operational bounds

- Plan said: Guest search and calendar feeds return bounded, deterministic output, but it did not set household limits.
- Found: Exhaustive recommendation and unbounded calendar history could grow without a predictable ceiling.
- Chose: Recommendation now uses polynomial dynamic programming. Guest search fails closed above 20 active rooms, agent room output is capped and text-bounded, and a feed returns the 500 most recent eligible events before deterministic rendering.
- Why: These limits are well above the intended household scale and prevent one request or calendar poll from growing without bound. A larger property or longer calendar archive needs a separately designed pagination or retention policy.
