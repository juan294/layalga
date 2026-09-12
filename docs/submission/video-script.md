# L’Ayalga demo video script

Recording script for v1.3.9. It includes the run-result presentation fixes found during rehearsal and retains the broader production evidence from v1.3.2 until the v1.3.9 release gate completes. Target duration: 2 minutes 55 seconds. Hard maximum: 3 minutes. The public video URL remains pending recording and upload.

The story is routine coordination, then a fresh exception, then follow-through and closure. Use the [judge guide](judge-guide.md) for the canonical journey and the [evidence report](coordination-evidence.md) for numerical claims.

## Recording setup

- Record `https://layalga.thecreativetoken.com` only after `/api/health` reports `status: ok`, identifies the v1.3.9 release commit, and reports no stale or retrying work.
- Use one visible English browser tab for both host and guest views. Navigate with the product's **Return to the host view** and **Return to the current demo guest** links so every transition remains visible in the recording. Do not operate a background tab.
- Start with the host signed in through the synthetic demo entry. Keep personal tabs, notifications, passwords, bearer URLs, email addresses, private notes, AWS account identifiers, and raw memory records out of frame.
- Set browser zoom before recording and keep it fixed. Use a desktop viewport large enough to show one complete card and its main action without scrolling during narration.
- Each guided scenario resets shared synthetic state. Show the reset message when moving from Vega to Parker so the video does not imply that the two visits coexist.
- Production uses AgentCore Runtime, Sonnet 4.6, AgentCore Memory, and host SES. Synthetic guests never send guest email. Do not describe SES provider acceptance as inbox delivery or a guest reply.
- Record the complete flows first. Keep the controlled tab in the foreground for every action. Pause on each meaningful form, queued/running state, interruption, decision, resumed run, and completed outcome long enough for a viewer to understand it. Trim only idle loading time in the edit.
- Prepare the [protected production workflow](https://github.com/juan294/layalga/actions/runs/34583050263) as a brief final cutaway.

## 0:00–0:18 — The household problem

**Screen:** Title card for two seconds, then the English host dashboard. Frame the current outcomes and guided demo panel.

**Narration:**

“L’Ayalga coordinates visits for households with more than one host. Invitations arrive through different people, but rooms, rules, requests, and follow-up need one consistent answer. The agent prepares routine work, deterministic code protects booking facts, and people decide exceptions.”

## 0:18–0:50 — A routine stay completes

**Screen:** Start Vega in the visible tab and show the reset transition into the English guest view. Search for four guests, keep both open rooms selected, show the memory explanation, enter “Thank you for having us” as an informational note, and submit. Hold on the queued/running timeline and completed result, then select **Return to visit** and **Return to the host view**. Show the confirmed host outcome.

**Narration:**

“Vega is a routine visit. The guest searches real availability and chooses exact rooms. Remembered preferences can rank valid options, but the guest keeps control and policy still applies. A thank-you remains information without creating an approval task. AgentCore completes the request as a confirmed stay.”

If the preference panel reports no usable memory, say: “Memory is unavailable here, so the product shows the fallback instead of inventing a preference.”

## 0:50–1:05 — The guest answers

**Screen:** In the visible host view, select **Advance to next guest reminder**, then select **Return to the current demo guest**. Answer **Yes, we are coming**, use **Return to the host view**, and show the reconfirmed host outcome.

**Narration:**

“Coordination continues after booking. The labeled demo clock advances to a persisted reconfirmation job. The guest answers, the stay becomes reconfirmed, and the escalation is retired.”

## 1:05–1:43 — A fresh exception needs a person

**Screen:** Start Parker in the visible host view and show that the reset begins a separate scenario. In the English guest view, search for two guests, select the Garage Room, and point to the captured explicit request. Submit and hold on the interrupted run. Select **Return to the host view**, show the pending decision, and approve it. Select **Return to the current demo guest**, show the resumed run and confirmed outcome, then return visibly to the host.

**Narration:**

“Parker starts a separate scenario with an explicit request. Before booking, a Strands policy hook checks capacity, occupancy, and household rules, then interrupts for a host decision. Approval resumes the persisted execution and checks current state again. Old approval cannot force an occupied room or invalid policy through.”

Do not call this an overflow booking unless the selected option visibly requires overflow.

## 1:43–2:05 — Unanswered follow-through

**Screen:** In the host view, advance to Parker’s next guest reminder. Open the current demo guest long enough to show the unanswered request, then return to the host and advance to the next host follow-up. Show the unresolved host outcome and the separate delivery state.

**Narration:**

“This guest does not answer. After the configured interval, the coordinator returns the unresolved follow-up to both hosts. Delivery status stays separate from guest response, so a send problem is never reported as silence.”

## 2:05–2:23 — Clear closure

**Screen:** Open Parker’s guest cancellation review, show the exact stay, confirm it, then show the cancellation result and the host view without an active visit outcome.

**Narration:**

“The guest reviews the exact stay and confirms cancellation. Rooms are released, and obsolete decisions, runs, reminders, and delivery work lose authority. A message can prepare this review, but it cannot cancel the stay.”

## 2:23–2:50 — Implementation and production evidence

**Screen:** Briefly show the GitHub workflow summary with the successful guided demo and nine probes. Return to the signed-in host dashboard and finish on the product name and live URL. Do not sign out: after cancellation there is no active demo guest invitation, so the sign-in page correctly shows only the host action.

**Narration:**

“Strands supplies typed tools, session storage, memory, and durable human interruption. The web app runs on Vercel, the agent on Amazon Bedrock AgentCore with Claude Sonnet 4.6, and PostgreSQL remains authoritative. The proven production release passed the guided demo and all nine probes, including concurrency, interruption, memory, guest isolation, and cleanup.”

## 2:50–2:55 — Close

**Screen:** L’Ayalga title and URL.

**Narration:**

“L’Ayalga handles routine coordination, brings exceptions to people, and follows through.”

## Final recording check

- Duration is at or below 2 minutes 55 seconds, leaving at least five seconds below the 3-minute maximum.
- Narration is clear at normal speed and captions have been reviewed manually.
- The video remains understandable when muted.
- The working application occupies most of the runtime; workflow evidence is one short supporting cutaway.
- Every claimed transition appears on screen. Edited waits do not hide a failure or imply that a different run completed.
- The current production commit is visible or stated once. No secret, private URL, contact address, personal notification, or cloud account identifier appears.
- Synthetic reset and clock controls are visibly labeled. No human time-saving, inbox-delivery, accessibility, or universal model-quality claim is made.
- Upload to YouTube or Vimeo as public, confirm playback in a signed-out window, and then place the final URL in the Devpost entry.

Do not mark the video or Devpost entry as published until each outward action has completed.
