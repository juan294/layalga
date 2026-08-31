# L’Ayalga five-minute demo script

Target length: 4:55. Hard limit: 5:00.

## Before recording

- Run `pnpm run demo:e2e -- --base <target>` once, then reset the demo.
- Open one Spanish host tab as Juan and one English host tab as Jordan.
- Open the Vega guest link in Spanish and the Oteros guest link in English.
- Close password managers, notifications, bookmarks, and unrelated tabs.
- Set browser zoom so the host calendar, decisions, activity, and demo clock fit without horizontal scrolling.
- Confirm that the banner says `Synthetic demo` and that the clock is visibly labeled.
- Keep this script on a second screen. Do not show secrets, terminal history, cloud account numbers, or private guest-link tokens.

## 0:00–0:45 — The problem and audience

**On screen:** L’Ayalga title, then the empty host view shared by Juan and Jordan.

**Narration:**

“This is L’Ayalga, an AI hospitality coordinator for homes with more than one host. It grew from a familiar problem: invitations happen in messages, each host makes plans independently, and a calendar does not know whether two families can comfortably share a house.

L’Ayalga turns an informal invitation into a private guest flow. It finds rooms for partial overlaps, follows up before arrival, and asks a person only for social judgment. The model coordinates, but code and Postgres own every booking decision.”

## 0:45–1:30 — Beat 1: capture an informal invitation

**On screen:** Juan’s Spanish host tab. Paste the prepared Familia Vega invitation and submit it. Briefly show the queued run state, then the structured party, flexible dates, and generated guest link. Do not expose the full token for longer than needed.

**Narration:**

“Juan receives this Spanish message from Familia Vega. He pastes it as-is. The request enters a durable Postgres queue, and this page follows that exact run to completion. A Strands agent calls a typed capture tool, keeps the original message for audit, and structures the party: two adults, two children, Spanish locale, and flexible dates.

The result is tentative, not booked. L’Ayalga creates a high-entropy guest link and stores only its hash. Vega can now choose from dates that the deterministic booking engine says are possible.”

## 1:30–2:15 — Beat 2: guest selects and confirms

**On screen:** Vega’s Spanish guest tab. Find options, select the prepared stay, submit, show the confirmation and room count. Briefly return to the host calendar to show the confirmed visit.

**Narration:**

“Vega opens the link without an account. The page shows only their invitation. It never reveals room names or another family’s identity.

When Vega submits these dates, the agent requests a temporary hold. Before the tool can run, a policy hook checks beds, children, and pets in that fixed order. PostgreSQL also has a range exclusion constraint, so two simultaneous requests cannot win the same room. This stay passes, the hold is placed, and the same run confirms it.”

## 2:15–3:30 — Beat 3: interrupt, human decision, resume

**On screen:** Jordan’s English host tab. Capture the Oteros invitation. Open their English guest page and submit the prepared overlapping dates with the ground-floor wheelchair-access request. Switch to Juan’s host view. Show the pending decision reason, select Approve, then show the completed visit and activity entry.

**Narration:**

“Jordan independently invites the Oteros. Their dates overlap Vega, but partial overlap is a first-class case: free rooms still exist, and the children and pets rules pass.

The Oteros also need ground-floor wheelchair access. That is a social exception, so the policy hook interrupts the Strands run before the booking tool executes. The complete session snapshot and a separate pending decision are stored in Postgres.

Juan sees what is at stake and approves. A new run restores the saved session, supplies his response to the exact interrupt, and continues the pending tool call. The decision stays approved; a `decision_applied` audit event records the consuming run. The booking tool executes once, even though the process stopped and resumed.”

## 3:30–4:20 — Beat 4: proactive follow-through

**On screen:** Host view with the labeled synthetic clock. Use the first preset to move to T-3. Show the two party chase notifications. Do not reconfirm Oteros. Use the second preset to move 24 hours forward. Show one escalation for Juan and one for Jordan.

**Narration:**

“Coordination does not end when dates are booked. I will use a clearly labeled synthetic clock so we can test time without pretending to wait three months.

At three days before arrival, the same production state machine asks both parties to reconfirm. One party does not answer. Twenty-four hours later, one claimed scheduled job sends exactly one escalation to each host. Jobs and notifications carry idempotency keys, so a retry does not duplicate the alert.”

## 4:20–4:50 — Architecture and technical choice

**On screen:** `docs/architecture/layalga-architecture.svg`. Point to the policy hook and the interrupt/resume loop.

**Narration:**

“The selected build runs Next.js and a durable Strands work queue on Vercel, with Supabase Postgres as the system of record. Next.js starts work after the response, and Vercel Cron recovers leases, drains queued runs, and handles due jobs. Strands handles natural language and typed tool use. A pure TypeScript policy and database constraints remain authoritative.

We also deployed the same agent to Bedrock AgentCore Runtime. After resolving the account-level Anthropic access gate, Sonnet completed a live run, called our typed invitation tool, and left matching run, invitation, audit, and session records in Postgres through a restricted database role. The selected production path remains local until we complete the full interrupt-and-resume cloud gate.”

## 4:50–4:55 — Close

**On screen:** Final calendar with both visits and the L’Ayalga title.

**Narration:**

“L’Ayalga turns hospitality from scattered messages into safe, human-centered follow-through: the agent coordinates, code decides, and people keep the judgment that matters.”

## After recording

- Confirm the file is under 300 seconds with `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 <video>`.
- Watch once with sound and once muted. Check that every action is understandable in both modes.
- Check that Spanish and English each appear at least once.
- Check that no guest token, secret, personal notification, or cloud credential is readable.
- Record the final video URL in `docs/submission/devpost.md` only after upload authorization.
