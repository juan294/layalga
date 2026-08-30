# Interrupts for household decisions

Status: Draft. Publication needs separate authorization.

## The useful pause

An agent that coordinates a shared home should not try to remove people from every decision. It should remove the repeated work around those decisions.

L’Ayalga receives informal invitations, creates private guest links, checks overlapping stays, confirms rooms, and follows up before arrival. Most of that work is mechanical. One part is not: whether a special request is socially comfortable for the people sharing the home.

That boundary gave us a simple design rule. If a request is impossible, deny it with deterministic code. If it is safe and routine, continue. If it is possible but needs context, interrupt the agent before the consequential tool runs.

## Why a database row is not enough

A basic approval workflow can insert a `pending_decisions` row and start a new request after a host responds. That records the business state, but it does not preserve the agent’s execution state. The new request can make the model reconstruct what it was doing, which can repeat a tool call or produce a different plan.

Strands interrupts preserve a stronger contract. A `BeforeToolCallEvent` hook can call `event.interrupt(...)`. The SDK stops with the pending tool execution in its session snapshot. On resume, `InterruptResponseContent` returns the host response to that exact hook invocation. The agent continues from the paused point instead of asking the model to recreate it.

For L’Ayalga, the sequence is:

1. The model requests `create_temporary_hold`.
2. The policy hook loads the proposed stay and current house state.
3. A special request produces `decision: "interrupt"`.
4. The hook calls `event.interrupt({ name: "host_decision", reason })`.
5. Strands saves the session snapshot to Postgres.
6. L’Ayalga writes a pending decision that the host can understand and act on.
7. The host records `approved` or `declined`.
8. A new run restores the session and supplies the response.
9. The hook continues. Approval permits the pending tool; decline cancels it.

The model does not need to call the tool again.

## Three records, three meanings

We first described a resume as “marking the decision applied.” That wording hid three different facts:

- The host chose `approved` or `declined`.
- A specific run consumed that choice.
- Strands continued or cancelled the pending tool execution.

Our schema allows only `pending`, `approved`, and `declined` for the decision itself. We kept that contract. The resume run records application with an audit event:

```json
{
  "kind": "decision_applied",
  "payload": {
    "pendingDecisionId": "…",
    "runId": "…",
    "interruptId": "…"
  }
}
```

This separation matters during a failure. A host can approve successfully, then a resume can fail before Strands consumes the response. The decision is still approved, but it has not yet been applied. A retry can use the same facts without inventing a new decision state.

## The policy hook stays authoritative

The hook does not accept a model claim that a request needs approval. It derives the verdict from typed input and current database state:

```ts
const { homeId, draft, approvalStayHash } = await loadDraftForTool(
  deps,
  event.toolUse.name,
  input,
);
const verdict = evaluateOverlap(
  draft,
  await loadHouseState(deps, homeId, draft),
);

if (verdict.decision === "deny") {
  event.cancel = denyMessage(verdict);
  return;
}

if (
  verdict.decision === "interrupt" &&
  !approvalCovers(draft, approvalStayHash)
) {
  const response = event.interrupt<HostDecision>({
    name: "host_decision",
    reason: verdict,
  });
  if (!response.approved) event.cancel = "Declined by host";
}
```

The approval is tied to a hash of the proposed stay. If the dates or party details change, the old approval does not silently cover the new request.

## Process restarts are part of the feature

Serverless and managed agent runtimes make process lifetime an unreliable place to store user decisions. We therefore implemented the Strands `Storage` interface over Postgres and used stable session identifiers. Our tests interrupt one agent, destroy it, build a new agent with the same session, and resume. A separate-process test proves that the behavior does not depend on a module singleton.

The important assertions are negative as well as positive:

- Before approval, no hold exists and the tool audit count is zero.
- After approval, exactly one hold exists and the tool audit count is one.
- After decline, no hold exists.
- Replaying the same response does not create another booking.
- A changed stay needs a new decision.

## A practical human-in-the-loop boundary

An interrupt is useful when the system can explain a bounded choice. “The beds rule failed” is not a choice; it is a denial. “This request needs ground-floor access while another family is present” gives a host specific context and clear actions.

That distinction keeps the agent helpful. People do not become a generic fallback for every uncertainty. They receive only the decisions that belong to them, with the agent’s work preserved on both sides of the pause.

The result is not full autonomy. It is accountable continuity: the agent gets as far as code allows, waits where judgment starts, and resumes the exact work after a person decides.
