# L’Ayalga: an Everyday Agents pitch

L’Ayalga coordinates visits to a shared household. A host pastes an invitation; guests choose suitable rooms; routine stays complete; explicit requests return to a person. Before arrival, it asks whether the guests are still coming and brings unanswered requests back to the hosts.

The product is designed for a concrete burden: more than one host can invite independently, but room availability, children, pets and social requests still need one consistent answer. A calendar records dates. This workflow also records who needs to decide and what happens next.

## Why an agent belongs here

Language is useful at the edges: interpreting an informal invitation, understanding a change request, preparing a room action and explaining an outcome in the recipient's language. Strands connects that interpretation to typed tools and durable human interruption.

The booking facts remain deterministic. Rooms and household rules are rechecked before writes. Overflow requires explicit guest consent and host approval. A saved approval cannot override a newly occupied room or a changed policy. A cancellation message prepares review; a person confirms the exact current stay before it is cancelled.

## Why the experience now holds together

The routine path demonstrates the benefit first. A thank-you is retained as information, without manufacturing a host decision. When something does need judgment, the decision is prominent and the reason is explicit. After approval, the saved run resumes against the current state.

Memory has a visible job: supported remembered preferences rank feasible room combinations. The guest sees what matched and can choose differently. Missing, conflicting or unavailable recall is explained. A ground-floor preference never becomes a promise of accessibility or an unsolicited special request.

Follow-through includes answered reconfirmation, unanswered escalation, optional verified guest reminders, and explicit cancellation or withdrawal. Delivery trouble is distinguished from non-response. Cancellation releases rooms and suppresses pending work that no longer has authority.

## The technical foundation

Strands supplies the loop, typed tool execution, the policy hook, interruption/resumption, session storage and optional memory integration. The current model configuration is Claude Sonnet 4.6 on Bedrock. AgentCore Runtime, AgentCore Memory and CloudWatch support the deployed architecture; PostgreSQL owns booking truth. The [Strands guide](strands-usage.md) links the actual implementation rather than asking a reviewer to infer depth from a technology list.

Privacy is enforced at specific boundaries. Guest contacts are web-only; notes, arrival details and request prose are excluded from the guest-submission prompt. Raw host text may still contain personal information and is read by the model. Host capture conversations are not extracted into memory, and guests cannot read another party's details or private room notes.

## The evidence and the honest limit

The implementation at `618701c` has local regression and browser coverage. The [coordination evidence](coordination-evidence.md) measures actual scripted operations and persisted outcomes. Historical AgentCore tracing separately supports the earlier production runtime. The new completion features have not yet completed production rollout.

We have not measured human time savings, adoption or participant satisfaction. The [participant protocol](participant-protocol.md) is the next step toward testing that impact. The product's strongest award case is a complete, inspectable household workflow with useful agency and visible human control; winning remains a judging decision.

## Suggested spoken close

“L’Ayalga handles routine coordination, brings the right exceptions to people, and follows through until the household knows what happens next.”

For the demonstration sequence, use the [judge guide](judge-guide.md) and [video script](video-script.md). Recording, upload and submission remain owner actions; no finished video is implied by this draft.
