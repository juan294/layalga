# L’Ayalga demo video script

Draft for owner recording on 13 September 2026. Target about three minutes; the [official maximum](https://agentsforhumans.devpost.com/rules) is five minutes. The final video URL is pending recording and upload authorization.

The story is routine coordination, then a fresh exception, then follow-through. Use the [judge guide](judge-guide.md) as the canonical sequence and the [evidence report](coordination-evidence.md) for any numerical claims.

## Before recording

- Select a verified target revision. The completion implementation is `618701c`; do not assume the public site already contains it. Record the target's model/runtime/memory/email configuration.
- Use synthetic data and the clearly labeled demo clock. Each guided scenario resets shared state; show that transition rather than implying both visits coexist.
- Prepare one Spanish host view and an English guest view. Keep unrelated tabs, personal notifications, passwords, bearer links and raw memory records out of frame.
- Use the automatic capture completion flow if showing a newly captured invitation. Do not insert the obsolete manual link-preparation step. Copying and sending remain explicit.
- With `MEMORY=none`, show the honest fallback. Only show preference-based ranking on a target where usable scoped recall has actually been verified; do not claim an unobserved memory result.
- Local synthetic evidence uses `EMAIL=none`. Guest demo invitations do not send guest email. Show delivery state honestly; live enrollment or sending requires separate authorization and operational readiness.
- Have the [architecture](../architecture/README.md) and dated [AgentCore trace](assets/agentcore-trace.png) ready. Identify historical evidence as historical.
- Do not run remote seed, deployment, IAM, email or publishing commands just to prepare the recording without separate authorization.

## 0:00–0:20 — The household problem

**Screen:** Title, then the decisions-first host dashboard and guided demo panel.

**Narration:**

“L’Ayalga coordinates visits for a household with more than one host. Invitations arrive through different people, but rooms, household rules and follow-up need one consistent answer. The agent interprets and prepares. Code protects booking facts. People decide the exceptions.”

## 0:20–0:55 — A routine stay completes

**Screen:** Start Vega, visibly resetting the synthetic scenario. Search for four guests and keep both open rooms. Briefly show the preference explanation or its honest fallback. Add an informational thank-you, submit, and show the confirmed guest result and host outcome.

**Narration:**

“Here is a routine visit. The guest selects actual available rooms. A thank-you stays with the visit without asking a host to approve it. The booking completes and both sides can see the result.

When supported household memory is available, preferences rank valid rooms. The explanation shows what matched, and the guest can choose differently.”

Do not imply memory influenced this particular result when the displayed state is off or unavailable.

## 0:55–1:15 — The guest answers

**Screen:** Run Advance to next guest reminder, open the guest journey, answer Yes, we are coming, and return to the reconfirmed host outcome.

**Narration:**

“Coordination continues after booking. This labeled clock advances to an actual scheduled reconfirmation job. The guest answers, and the pending escalation is no longer needed.”

## 1:15–1:55 — A fresh exception needs a person

**Screen:** Start Otero, showing that this resets the first scenario. Search for two guests and select the Garage Room. Highlight the captured explicit request, submit, then show the waiting run and the host decision. Approve, show completion and the confirmed outcome.

**Narration:**

“This separate scenario contains an explicit request. The agent pauses before the relevant booking operation and asks a host. Approval resumes the saved execution only after checking current availability and household policy. A stale approval cannot force an invalid booking through.”

The request is distinct from an informational note. Do not describe it as an overflow booking unless the recorded selection actually requires overflow.

## 1:55–2:20 — Unanswered follow-through

**Screen:** Run Advance to next guest reminder for Otero, leave it unanswered, then Advance to next host follow-up. Show the unresolved host outcome and delivery state. Repeat an exhausted shortcut briefly if time allows.

**Narration:**

“This time the guest has not answered. After the configured interval, the coordinator brings follow-up to the hosts. A delivery problem is shown separately from no reply. The clock works from persisted jobs; repeating an exhausted step does not invent another alert.”

Do not promise inbox delivery. SES acceptance and recipient receipt are different facts.

## 2:20–2:40 — Clear closure and consent

**Screen:** Show the guest's exact cancellation review, explicitly confirm it, then show cancellation completion, the removed active host outcome and released rooms. A short preferences-panel cutaway can show optional verified reminders and opt-out without enrolling a real address.

**Narration:**

“A change of plans has a complete ending. A person confirms cancellation, the rooms are released, and obsolete decisions and follow-up stop. Real guests can separately consent to verified reminders and opt out. A cancellation message alone never cancels a stay.”

## 2:40–3:00 — Implementation and evidence

**Screen:** Architecture, then the dated AgentCore trace with a historical caption. End with the measured evidence report and title; keep any actual numerical result consistent with that report.

**Narration:**

“Strands provides the agent loop, typed tools and durable human interruption. This earlier production trace shows AgentCore execution; the current model configuration is Sonnet 4.6. Our local synthetic benchmark measures completed workflows, not human time saved.

L’Ayalga handles routine coordination, brings exceptions to people, and follows through.”

## After recording

Check duration, sound, muted comprehensibility, English/Spanish visibility and that every claimed action appears on screen. Mask tokens, calendar URLs, contact addresses, private notes and cloud account identifiers. Label local/scripted and historical evidence accurately. If an optional WebMCP or calendar cutaway is added, identify whether it is a native-browser demonstration or local component/parser proof; do not imply direct calendar writes.

Only after authorized upload, place the real URL in [Devpost draft](devpost.md). Do not mark the entry submitted or the Builder posts published until those owner actions actually occur.
