# Agent-First Room Coordination Plan Deviations

## Deviations

### Non-demo legacy room backfill

- Plan said: Backfill every existing room as available with placeholder guest metadata for compatibility.
- Found: That would expose an unknown non-demo room to guest allocation without host-confirmed floor or sleeping details, which conflicts with the plan's fail-closed inventory rule.
- Chose: Backfill identified synthetic demo rooms as available. Keep non-demo legacy rooms as draft, preserve their standard and maximum capacity, and preserve existing occupancy identities.
- Why: Unknown real inventory must remain unavailable until a host completes it. A dedicated migration-upgrade test now proves that the actual migration preserves a legacy room and occupancy while leaving the room draft.
