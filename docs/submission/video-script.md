# L’Ayalga demo video script

Recording script from the v1.3.3 documentation release. It targets application behavior proven in production v1.3.2 at commit `90b68385a590144d6d44cd7dd41298180b2d182c`; v1.3.3 changes documentation only. Target duration: 4 minutes. The [official maximum](https://agentsforhumans.devpost.com/rules) is five minutes. The public video URL remains pending recording and upload.

The story is routine coordination, then a fresh exception, then follow-through and closure. Use the [judge guide](judge-guide.md) for the canonical journey and the [evidence report](coordination-evidence.md) for numerical claims.

## Recording setup

- Record `https://layalga.thecreativetoken.com` only after `/api/health` reports `status: ok` and no stale or retrying work. The live commit can be newer than the v1.3.2 behavioral proof when it contains documentation-only releases.
- Use a Spanish host view and an English guest view. Keep each in a named browser tab so the switch is clear.
- Start with the host signed in through the synthetic demo entry. Keep personal tabs, notifications, passwords, bearer URLs, email addresses, private notes, AWS account identifiers, and raw memory records out of frame.
- Set browser zoom before recording and keep it fixed. Use a desktop viewport large enough to show one complete card and its main action without scrolling during narration.
- Each guided scenario resets shared synthetic state. Show the reset message when moving from Vega to Otero so the video does not imply that the two visits coexist.
- Production uses AgentCore Runtime, Sonnet 4.6, AgentCore Memory, and host SES. Synthetic guests never send guest email. Do not describe SES provider acceptance as inbox delivery or a guest reply.
- Record the complete flows first. Trim idle loading time in the edit, but leave the queued, running, interrupted, resumed, and completed states visible long enough to read.
- Prepare the current [architecture diagram](../architecture/layalga-architecture.png) and the [v1.3.2 production workflow](https://github.com/juan294/layalga/actions/runs/34583050263) as final cutaways.

## 0:00–0:25 — The household problem

**Screen:** Title card for two seconds, then the Spanish host dashboard. Frame the current outcomes and guided demo panel.

**Narration:**

“L’Ayalga coordinates visits for a household with more than one host. Invitations arrive through different people, but rooms, household rules, special requests, and follow-up need one consistent answer. The agent interprets and prepares. Deterministic code protects booking facts. People decide the exceptions.”

## 0:25–1:05 — A routine stay completes

**Screen:** Start Vega and show the reset confirmation. Switch to the English guest view. Search for four guests, keep both open rooms selected, show the memory explanation, enter “Thank you for having us” as an informational note, and submit. Show queued/running status, then the confirmed result. Return briefly to the host outcome.

**Narration:**

“Vega is a routine visit. The guest searches the household’s real availability and chooses the exact rooms. Remembered preferences can rank valid options, but the guest keeps control and household policy still applies. A thank-you remains useful information without creating an approval task. The request runs on AgentCore and completes as a confirmed stay.”

If the preference panel reports no usable memory, say: “Memory is unavailable here, so the product shows the fallback instead of inventing a preference.”

## 1:05–1:25 — The guest answers

**Screen:** In the host view, select **Advance to next guest reminder**. Switch to Vega, answer **Yes, we are coming**, then show the reconfirmed host outcome.

**Narration:**

“Coordination continues after booking. This labeled synthetic clock advances to an actual persisted reconfirmation job. The guest answers, the outcome becomes reconfirmed, and the pending escalation is retired.”

## 1:25–2:15 — A fresh exception needs a person

**Screen:** Start Otero and show that the reset begins a separate scenario. In the English guest view, search for two guests, select the Garage Room, and point to the captured explicit request. Submit. Hold on the interrupted run, switch to the host decision, approve it, then show the resumed run and confirmed outcome.

**Narration:**

“Otero starts a separate scenario with an explicit request. The request is preserved apart from ordinary notes. Before the booking tool can run, a Strands policy hook evaluates current capacity, occupancy, and household rules, then interrupts for a host decision. Approval resumes the persisted execution in a new run and checks the current state again. An old approval cannot force an occupied room or invalid policy through.”

Do not call this an overflow booking unless the selected option visibly requires overflow.

## 2:15–2:45 — Unanswered follow-through

**Screen:** Advance to Otero’s next guest reminder and leave it unanswered. Advance to the next host follow-up. Show the unresolved host outcome and the separate delivery state.

**Narration:**

“This time the guest has not answered. After the configured interval, the coordinator returns the unresolved follow-up to both hosts. Scheduled work, retries, and notification fallback are persisted. Delivery status remains separate from guest response, so a send problem is never misreported as silence.”

## 2:45–3:10 — Clear closure

**Screen:** Open Otero’s guest cancellation review, show the exact stay, confirm it, then show the cancellation result and the host view without an active visit outcome.

**Narration:**

“A change of plans has a complete ending. The guest reviews the exact current stay and confirms cancellation. Rooms are released, and obsolete decisions, runs, reminders, and delivery work lose their authority. A cancellation message alone can prepare this review, but it cannot cancel the stay.”

## 3:10–3:55 — Implementation and production evidence

**Screen:** Show the architecture diagram, then the v1.3.2 GitHub workflow summary with the successful guided demo and nine probes. End on the product title and live URL.

**Narration:**

“Strands supplies the agent loop, typed tools, session storage, memory integration, and durable human interruption. The web app runs on Vercel, the agent runs on Amazon Bedrock AgentCore with Claude Sonnet 4.6, and PostgreSQL remains authoritative. Operational leases use database wall time, so the demo clock cannot reclaim a live worker. This exact production release passed the guided demo and all nine probes, including memory, host email acceptance, concurrency, interruption, guest isolation, and cleanup.”

## 3:55–4:00 — Close

**Screen:** L’Ayalga title and URL.

**Narration:**

“L’Ayalga handles routine coordination, brings exceptions to people, and follows through.”

## Final recording check

- Duration is below five minutes, with two seconds of safe margin at each edit boundary.
- Narration is clear at normal speed and captions have been reviewed manually.
- The video remains understandable when muted.
- The working application occupies most of the runtime; architecture and workflow evidence are short supporting cutaways.
- Every claimed transition appears on screen. Edited waits do not hide a failure or imply that a different run completed.
- The current production commit is visible or stated once. No secret, private URL, contact address, personal notification, or cloud account identifier appears.
- Synthetic reset and clock controls are visibly labeled. No human time-saving, inbox-delivery, accessibility, or universal model-quality claim is made.
- Upload to YouTube or Vimeo as public, confirm playback in a signed-out window, and then place the final URL in the Devpost entry.

Do not mark the video, optional Builder posts, or Devpost entry as published until each outward action has completed.
