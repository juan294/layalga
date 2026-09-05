# Everyday Agents product checkup

Documentation status, September 5, 2026: Historical snapshot: the observations, open items and recommendations below describe the recorded date and revision. Current product behavior and remaining work supersede this snapshot in the [roadmap](../roadmap.md) and [judge guide](../submission/judge-guide.md).

Date: 2026-09-05. Repository: `develop`, `bf50416`.

Scope: user-requested product assessment and recommendations against the current hackathon. Read-only inspection of product code, roadmap and submission documents, plus browser inspection of the live sign-in and host dashboard. No booking, model run, email, deployment, publication, or test suite was triggered. Recommendations are included because the user explicitly requested gaps and opportunities; this is not an implementation plan.

## Verdict

L’Ayalga is a credible track-prize contender on implementation and originality. There is insufficient evidence to call it a favorite: the [project gallery](https://agentsforhumans.devpost.com/project-gallery) is not published. The main competitive weakness is the distance between strong coordination machinery and visibly reduced household effort.

The product's compelling story is two hosts inviting independently, partial overlap, and the agent handling routine coordination while preserving human judgment for exceptions. A judge can currently encounter a polished room-management dashboard without seeing that story. Completion of the guest follow-through loop, a reliable judge journey, and evidence of saved effort would improve positioning more than another infrastructure feature.

The [overview](https://agentsforhumans.devpost.com/) emphasizes background everyday work and selective interruption. The [rules](https://agentsforhumans.devpost.com/rules) weight implementation, design, impact, originality and presentation equally. They allow a five-minute video and award up to 0.6 bonus points for three qualifying Builder posts, 0.2 each. Submission closes September 14 at 17:00 PDT; judging ends October 8. A working live demo and AgentCore strengthen the implementation assessment. These are contest facts; the priorities below are my judgment.

## Current strengths

- Real actions: invitations, holds, exact room allocation and confirmation use authoritative transactions; rescheduling updates booking and reconfirmation state (`src/core/booking/holds.ts:144`, `src/core/booking/holds.ts:418`).
- Meaningful Strands behavior: a policy hook interrupts sensitive tools and rechecks current state after approval (`src/agent/policy-hook.ts:82`, `src/agent/policy-hook.ts:99`).
- Durable follow-through: scheduled reconfirmation, cancellation of escalation on reply, and escalation after silence (`src/core/reconfirmation/state-machine.ts:35`, `src/core/reconfirmation/state-machine.ts:71`, `src/core/reconfirmation/state-machine.ts:96`).
- Returning-party memory is implemented, with scoped recall (`src/agent/memory.ts:82`). AgentCore, SES and tracing are recorded as shipped in `CLAUDE.md:16`; this audit did not independently rerun the cloud execution proof.
- Live browser observation: coherent visual identity, English/Spanish entry, working one-click host demo entry, synthetic-data labeling, room controls, calendar, decisions, memory panel and email preferences.

The September 3 readiness research is historical. Its missing AgentCore, memory, tracing and host-email findings have been superseded by subsequent work.

## Product gaps, in priority order

### 1. Guest follow-through stops at the browser boundary

The notification tool writes an in-app record (`src/agent/tools/notify.ts:13`, `src/agent/tools/notify.ts:72`). The email outbox explicitly selects hosts only (`src/core/notifications/email-outbox.ts:60`). After 24 hours without reconfirmation, the state machine escalates to hosts (`src/core/reconfirmation/state-machine.ts:48`).

Consequently, a guest who closes the page receives no reminder outside the app. Silence may mean the guest never saw the request. The agent has scheduled the task, but the host still owns the last communication step.

Recommendation: make consented guest reminder delivery and a direct reconfirmation link the highest-priority substantive feature. Reuse the existing delivery architecture where appropriate, with explicit recipient binding, consent, revocation and delivery state. This is a scoped product change, not a trivial UI edit. Do not add WhatsApp/Twilio. Until implemented, describe reconfirmation as in-app and show that boundary honestly.

### 2. Cancellation has no complete journey

The guest manual directs cancellations into Request a change (`docs/guides/guest-manual.md:110`). The host manual admits no cancel control (`docs/guides/host-manual.md:255`). Registered tools lack cancellation (`src/agent/deps.ts:20`), while the guest-change prompt always instructs rescheduling (`src/agent/run-task.ts:1201`).

Recommendation: a confirmed cancellation should release rooms, cancel outstanding follow-ups, update the calendar and provide a clear outcome. This adds more everyday completeness than per-night room packing. Do not claim cancellation is handled today.

### 3. Informational notes become human decisions

Guest notes are appended to special requests (`src/agent/run-task.ts:1080`), and any special request triggers an interrupt (`src/core/policy/evaluate-overlap.ts:123`). A harmless note such as “Thanks!” therefore takes the human-review path when the rest of the request passes policy.

Recommendation: separate informational notes from explicit requests needing an answer. Preserve deterministic gates for consequential accommodations and overflow. This directly improves the promise that hosts are interrupted only for real decisions.

### 4. Link lifetime does not follow the visit

Guest links normally expire 30 days after issue (`src/core/booking/invitations.ts:63`, `src/core/booking/invitations.ts:90`). Token lookup checks database wall time (`src/core/booking/invitations.ts:231`). A link-only guest booking months ahead can lose access before reconfirmation. Authenticated invitation-ID access is a distinct path (`src/core/booking/guest-invitation.ts:202`).

Recommendation: design revocable access or renewal that covers the visit lifecycle, without requiring a new invitation and duplicate coordination.

## Highest-value demo and presentation fixes

1. **Align the exact judge scenario and demo clock.** The guide chooses Oteros arriving September 19 (`docs/submission/judge-guide.md:19`), then promises chase on September 15 and escalation September 16 (`docs/submission/judge-guide.md:21`). The buttons hardcode those dates (`src/components/host/demo-clock-panel.tsx:109`, `src/components/host/demo-clock-panel.tsx:118`). Arrival-minus-three is September 16, and escalation is 24 hours after the chase. As written, the first button cannot chase Oteros and the second starts the chase rather than escalating. Derive presets from the demonstrated visit or align all fixtures and instructions.
2. **Put decisions and invitation capture before room administration.** The host page renders rooms and calendar before pending decisions (`src/app/[locale]/(host)/page.tsx:398`, `src/app/[locale]/(host)/page.tsx:410`, `src/app/[locale]/(host)/page.tsx:444`). The live first screen showed room configuration; the inspected September calendar, activity and memory records were empty. A guided synthetic scenario should make the agent's value apparent on entry, with a reliable path for subsequent judges.
3. **Keep all advertised access paths usable throughout judging.** The fixed seeded bearer links expire October 1 (`src/lib/demo/reset.ts:75`, `src/lib/demo/reset.ts:94`). Their token lookup uses wall time, so the synthetic clock does not prevent expiry. This does not break every demo route: Enter as Guest issues a fresh cookie and loads by invitation ID (`src/app/[locale]/demo-enter-guest/route.ts:32`, `src/core/booking/invitations.ts:238`). Fix or retire the expiring advertised links and verify the intended entry route for the full judging period.
4. **Show one ordinary success before the exception.** Routine booking with zero host decisions establishes the value of selective escalation. A demo consisting mostly of holds, permissions and exceptions can make the agent appear to generate work.
5. **Measure an outcome.** The materials contain the founders' lived problem but no measured before/after task result. Replay one representative coordination scenario, record active host time, messages, decisions and unresolved follow-ups, and label synthetic replay measurements accurately. A few independent household-user walkthroughs would improve impact credibility. Do not manufacture time-saved figures.

## Submission and claims

- Video URL remains a placeholder (`docs/submission/devpost.md:15`); recording/upload/filing tasks remain unchecked (`docs/plans/2026-09-03-hackathon-final-stretch-phases/phase-5.md:18`). This is missing repository evidence, not proof nothing was uploaded elsewhere.
- Three Builder articles exist as drafts; publication is still unchecked (`docs/plans/2026-09-03-hackathon-final-stretch-phases/phase-5.md:16`). Refresh and publish them after authorization. The known bonus is unusually high-value compared with marginal engineering additions.
- Current script targets 2:55 (`docs/submission/video-script.md:3`) and spends substantial time on room controls, calendar internals, WebMCP and tracing. Favor a clear human outcome; keep architecture proof brief. Three minutes is a local target, not the contest maximum.
- Reconcile model-version claims and current entry labels across submission materials. `CLAUDE.md:17` describes Sonnet 4.6 while older submission copy still names 4.5. The live host button reads Enter as Juan González; the judge guide says Enter as Host (`docs/submission/judge-guide.md:15`).
- Tighten absolute privacy claims. Omitting dedicated family-name fields does not establish that arbitrary prose contains no names: capture-memory text includes freeform special requests and date text (`src/agent/record-capture-memory.ts:102`). Avoid claiming universal name removal without proving that boundary.
- Remove unsupported universal competitor claims such as every existing tool assuming one owner/calendar (`docs/submission/pitch.md:19`). The actual differentiator is specific enough without them.

## Roadmap opportunities

| Opportunity | Present state | Priority judgment |
| --- | --- | --- |
| Guest reminder delivery | Explicit follow-on beyond host-only email (`docs/submission/devpost.md:96`) | Highest substantive improvement to track fit |
| Cancellation | Missing end-to-end action | Higher than additional room optimization |
| Preference-informed room recommendations | Memory exists; room ranking uses count, spare capacity and display order, with no preference input (`src/core/rooms/recommendation.ts:9`, `src/core/rooms/recommendation.ts:31`) | Best differentiating next feature after core gaps; show memory changing an actual outcome |
| Host-configurable deterministic rules | Roadmap (`docs/submission/devpost.md:97`) | Valuable for adoption beyond the founding household |
| Plain-language decision explanations | Roadmap (`docs/submission/devpost.md:99`), existing timeline already supplies a base | Good bounded UX improvement |
| Per-night room packing | Roadmap (`docs/submission/devpost.md:98`) | Low pre-deadline return |
| Chat, remote MCP, two-way calendars, room photos | Deferred (`docs/plans/2026-08-31-agent-first-room-coordination.md:174`) | Keep deferred for this submission |

Suggested positioning: “For homes where more than one person invites guests, L’Ayalga turns scattered invitations into coordinated stays and brings hosts in when a real decision needs them.” Show the founders' actual experience, then generalize to siblings sharing a family home and other frequent co-hosts. The saved mental load is the reason to care; technical safeguards explain why the delegation is trustworthy.

Recommended order: repair and rehearse judge access and clock behavior; complete video, entry and bonus articles; document a measured coordination outcome; then close guest delivery and cancellation as available scope permits. Do not add SDK surfaces merely to increase their count.
