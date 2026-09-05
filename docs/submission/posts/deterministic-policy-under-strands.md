# Agents for Humans: deterministic household policy under a Strands agent

Unpublished Builder post draft, updated 5 September 2026 against product commit `618701c`. Publication and its URL remain owner actions. This draft does not earn a publication bonus. Completion features are locally verified; production rollout is separate.

## A booking needs more than a plausible answer

L’Ayalga coordinates visits to a household with multiple hosts. The agent can interpret “Could we come next weekend with the children?” It should not be able to invent a free room, consent to a sofa-bed arrangement, or decide that the household's pet rule does not matter.

We use Strands for language and tool execution, then put deterministic policy directly before the consequential tools. That boundary lets the product automate routine coordination while bringing a clearly stated exception to a person.

## Three different outcomes

A booking can proceed, be denied, or require a decision. Capacity and household rules are checked before special requests. If there are not enough beds, asking the host to approve an unrelated social request only adds confusion.

The household can configure the simultaneous families-with-children limit and whether parties with pets may overlap. The synthetic home defaults to one family with children and no overlapping parties with pets. These are versioned settings, not universal assumptions about every household. Capacity remains a hard constraint.

An explicit request or a documented overflow arrangement can require host review. Overflow needs the guest's own consent first. Above maximum capacity, the request is denied. Approval cannot override occupancy or a household rule.

## The Strands hook

[`installPolicyHook`](../../../src/agent/policy-hook.ts) subscribes to SDK tool-call events for hold creation, confirmation and rescheduling. It loads the trusted draft and room selection, evaluates policy and writes an audit verdict. It can cancel the tool call on denial or use `event.interrupt` to pause for a host.

The model cannot provide its own `approvedBy`, silently replace the selected rooms, or invent consent. On resume, the application reloads the current state and checks the proposal again. A decision made against old policy or a room arrangement that has changed is not sufficient authority to book now.

The write path uses a household advisory lock and PostgreSQL occupancy constraints. Search is a preview of what could work; the transaction makes the final determination. Expired holds release availability, while private blocks and live holds continue to count.

## A thank-you should not be a decision

Early product review exposed a useful distinction: information is not necessarily a request. “Thank you for having us” should remain visible with the stay without creating a host approval task.

The guest form now separates informational notes from explicit requests needing a decision. Captured requests are preserved in the trusted draft and survive resume. Notes, arrival details and request prose are omitted from the assembled guest-submission model prompt; the policy reads the requests directly from trusted state.

Memory follows the same principle. Supported remembered preferences can rank valid rooms, but never change counts, dates, rules or consent. Guests see matched and unmatched preferences and can choose differently. Missing or conflicting recall falls back visibly. A ground-floor preference is not an accessibility assessment.

## What the tests establish

The [policy refresh tests](../../../src/agent/policy-hook-refresh.test.ts), [settings integration tests](../../../src/core/policy/settings.integration.test.ts), [tenant tests](../../../src/agent/tenant-scope.test.ts) and [guest preference integration tests](../../../src/core/booking/guest-preferences.integration.test.ts) exercise these boundaries. The [coordination evidence](../coordination-evidence.md) records actual local scripted workflow operations and outcomes.

These checks do not establish human time savings or live-model quality. Raw host and guest-change text can contain personal information, even though guest-submission fields and web-owned contact data have stricter boundaries. The [Strands guide](../strands-usage.md) and [data lifecycle](../../security/data-lifecycle.md) describe that distinction.

The practical lesson is to make policy a reusable service, connect it to the agent at the point of action, and test the race between a reasonable proposal and a changed world.
