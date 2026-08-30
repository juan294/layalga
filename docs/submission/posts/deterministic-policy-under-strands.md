# A deterministic policy layer under a Strands agent

Status: Draft. Publication needs separate authorization.

## Prompts are not booking constraints

L’Ayalga coordinates invitations for a shared home. A model can turn “We might come around the middle of September with the children” into structured fields and a useful reply. It should not decide whether there are enough beds or whether two families with children can overlap.

Those rules have precedence, concurrency, and audit requirements. We implemented them as ordinary TypeScript and PostgreSQL constraints, then placed a Strands policy hook between the model and every consequential booking tool.

The result is a layered authority model:

- The model interprets language and selects typed tools.
- A pure function decides allow, deny, or interrupt.
- A transaction checks the current state again before it writes.
- A database exclusion constraint resolves the last concurrent race.

Each layer has one job.

## Start with a truth table

The home has three guest rooms and these rules:

1. The free rooms must have enough beds.
2. At most one family with children can overlap.
3. Parties with pets cannot overlap unless the home allows it.
4. Any other special request needs host approval.

Denial takes precedence over interruption. There is no reason to ask a host about a social exception when the party cannot fit in the available rooms.

We wrote the policy as `evaluateOverlap(draft, houseState)`. It has no SDK, web framework, or database dependency. Its return value is a discriminated union:

```ts
type PolicyVerdict =
  | { decision: "allow"; allocation: Room[] }
  | { decision: "deny"; reason: "beds" | "children" | "pets" }
  | { decision: "interrupt"; reason: "special_request"; allocation: Room[] };
```

The tests include boundary dates and explicit precedence rows. One fixture caught an important mistake in our plan: a three-person “children” draft had only two free beds, so it correctly failed the beds rule before reaching the children rule. We changed the fixture to one adult and one child. The policy stayed unchanged.

That is the value of a truth table. It tests the rule you intend to isolate, not only the outcome you hoped to see.

## Put the guard at the tool boundary

The model can request `evaluate_overlap`, but that tool is explanatory. It is not trusted as a gate. A model could skip it or call another tool with different input.

Instead, a `BeforeToolCallEvent` hook guards `create_temporary_hold`, `confirm_visit`, and `reschedule_visit`. The hook derives the draft from the actual tool input, loads current house state, runs the policy, and writes an audit event.

A denial sets `event.cancel` to a stable user-facing reason. An interruption calls `event.interrupt`. An allow verdict lets the tool continue.

This placement makes the invariant independent of the prompt and tool order. Any model, scripted test model, or restored session reaches the same check before the write.

## Check again inside the transaction

The hook observes a point in time. Another request can change the database before the tool starts its transaction. The booking function therefore locks the home row, reloads overlapping visits, reruns the same policy, and allocates rooms inside one transaction.

This makes normal requests serialize at the household boundary. It also keeps the pure policy reusable: the hook explains and interrupts early, while the transaction makes the write authoritative.

## Let PostgreSQL resolve the last race

Locks are easy to weaken by mistake, and not every future code path will necessarily use the same lock. We added an exclusion constraint over room and stay:

```sql
exclude using gist (
  room_id with =,
  stay with &&
)
```

Two allocations for the same room cannot have overlapping PostgreSQL `daterange` values. We tested the constraint without the application lock to prove that exactly one concurrent request wins.

The application normalizes the database conflict to a domain error. A failed tool result then ends the scripted run with a clear unavailable-room summary instead of repeatedly requesting the same denied tool.

## Partial overlap is the real product model

A single home-level “busy” flag would be simpler, but it would erase the problem L’Ayalga is meant to solve. The room allocator treats a room used by any overlapping visit as unavailable for the whole proposed stay. It then chooses enough free rooms for the party.

This is deliberately not per-night packing. A guest does not move between rooms during one stay. That simplification is explicit, tested, and suitable for the demo home.

Date ranges use the half-open form `[start, end)`. A visit ending on 15 September does not overlap one starting on 15 September. Boundary behavior lives in tests because an off-by-one rule in prose is still an off-by-one bug.

## Explainability comes from stable boundaries

The model can explain a verdict because the verdict has a small vocabulary and ordered reasons. Audit events record the tool, decision, reason, and run. The host view can show whether a booking was denied by capacity or paused for a special request without reproducing a hidden chain of model reasoning.

This approach does not reduce the agent to a form. The agent still handles the unstructured parts: messages, multilingual replies, tool sequencing, and proactive follow-up. It simply cannot override rules that should be the same on every run.

A useful agent is not one with the most authority. It is one whose authority is easy to locate. In L’Ayalga, language belongs to the model, policy belongs to code, and final room exclusivity belongs to Postgres.
