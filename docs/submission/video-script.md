# L’Ayalga five-minute demo script

Target length: 4:55. Hard limit: 5:00.

## Before recording

- Run `pnpm run demo:e2e -- --base <target>` once, then reset the synthetic demo.
- Run `scripts/seed-memory.ts` (or `pnpm exec tsx scripts/seed-memory.ts`) against the target's `MEMORY_ID` before recording, so the seeded Vega party already has recallable memory; do not write and read in the same take.
- Confirm that the demo proof covers the private-room proposal, date opening, exact multi-room choice, overflow interrupt and resume, WebMCP registration, private iCalendar output, memory recall, host email pings, and the run timeline.
- Open one Spanish host tab as Juan and one English host tab as Jordan.
- Open the prepared guest invitation in a separate browser profile or private window.
- Keep the host room ledger above the visit calendar and use a narrow second window for the guest flow.
- Have a phone (or a phone-width browser window on the email inbox) ready to show the two host email pings live, if `EMAIL=ses` is active on the target; otherwise skip the phone cutaways and say so in the narration.
- Have `docs/submission/assets/agentcore-trace.png` ready to show full-screen.
- Confirm that the banner says `Synthetic demo` and that the clock is visibly labeled.
- If the recording browser does not provide `document.modelContext`, use the automated WebMCP component proof. Do not enable an unreviewed polyfill or claim native browser execution.
- Issue the demonstration calendar feed locally. Use only the local HTTP and parser proof. Do not subscribe a real Google, iCloud, or family calendar.
- Close password managers, notifications, bookmarks, and unrelated tabs.
- Keep this script on a second screen. Do not show secrets, terminal history, cloud account numbers, full guest links, calendar bearer URLs, memory record raw JSON, or private source paths.

## 0:00-0:45 - The problem, the authority boundary, and what the house remembers

**On screen:** L’Ayalga title, then the host room ledger and visit calendar. Paste the second Vega invitation into the host capture form. While the run is in flight, show the run status page's timeline filling in: `capture_invitation`, then `search_memory`. Show the completed summary mentioning the remembered ground-floor preference.

**Narration:**

“This is L’Ayalga, an AI hospitality coordinator for homes with more than one host. Invitations arrive in messages, but a calendar does not know which rooms are suitable, whether an overlap is comfortable, or when a person must decide.

L’Ayalga lets the agent interpret and prepare. Deterministic services and Postgres decide availability. People keep final authority over sensitive changes.

Watch the run as it happens. This is the second invitation from a family we've hosted before. The agent searches what the household remembers, and the summary already reflects their ground-floor preference. No family name ever reached that memory or the model — only what the household needs to know.”

## 0:45-1:20 - Real-room boundary and private use

**On screen:** Show the synthetic room ledger and its door states. Expand one room to show the guest label, floor, sleeping arrangement, standard capacity, maximum capacity, and inventory state. Submit the prepared host message that asks for one room to be reserved for private use. Show the pending proposal, then apply it. Do not enter a real person's name in the public label.

**Narration:**

“The repository contains synthetic rooms only. A host enters the real inventory here. A draft or incomplete room stays unavailable, and a withheld room needs an explicit date opening.

I asked the coordinator to reserve this room for private household use. The Strands tool did not block it. It prepared a bounded proposal with exact dates and room IDs. I can inspect the effect before I apply it. The private block now uses the same occupancy constraint as a guest visit, so this room disappears from guest options for these dates.”

## 1:20-1:50 - Open a room for dates and select exact rooms

**On screen:** In the host ledger, open the withheld synthetic room for the prepared range. Switch to the guest invitation, search with the prepared dates and party counts, and show that the private room is absent while the newly opened room is present. Select the prepared two-room recommendation and submit it.

**Narration:**

“This room is withheld by default. I am opening it only for the guest's complete stay. The guest search now shows the rooms that are safe for this invitation and date range.

The guest can accept the deterministic recommendation or select more than one exact room. They see only guest-facing labels and sleeping details. They never see hidden rooms, internal names, private notes, another family, or another family's room assignment.”

## 1:50-2:35 - Overflow needs human approval, and the host gets a ping

**On screen:** Submit the prepared request that fits only at maximum capacity. Show the overflow notice with the exact room labels and sleeping arrangement. Cut briefly to the phone: show the pending-decision email arriving in each host's inbox. Switch to the host view, approve the pending decision, and show that the saved run completes once.

**Narration:**

“Normal capacity proceeds without extra review. This larger party fits only with the documented overflow arrangement. The policy hook pauses before the booking tool writes anything and shows the host the exact rooms and sleeping arrangement — and both hosts get an email the moment that happens, so they don't have to be watching the app.

After approval, the run reloads current availability. It rejects a changed or stale arrangement. If the state is unchanged, it resumes the saved tool call once. A party above maximum capacity is denied instead of sent for approval.”

## 2:35-3:05 - Browser agents prepare, people submit

**On screen:** Show the WebMCP registration proof. Invoke one bounded read tool and one guest or host preparation tool. Return to the page and show the filled fields with the submit button still waiting for a person. If native WebMCP is unavailable, show the focused component test and then the unchanged normal page flow.

**Narration:**

“When the browser provides WebMCP, L’Ayalga registers tools from the page that the person already opened. The schema cannot supply a home ID, host ID, invitation token, or database record.

The agent can fill this visible form, but it cannot submit a booking, private block, opening, or closure. WebMCP is progressive enhancement. The normal controls work without it.”

## 3:05-3:35 - Revocable, private iCalendar proof

**On screen:** Show the host calendar-feed controls and the issued feed label, but cover the subscription URL. Show the local parser result with generic all-day event summaries, guest count, and guest-visible room labels. Show the local assertion that private text is absent, then revoke the feed.

**Narration:**

“A host can issue separate calendar subscription capabilities and revoke each one. The database stores only a purpose-bound HMAC, not the bearer token.

This is a local proof. The feed uses generic events such as Guest stay and Private room use. It excludes names, email, invitation text, special requests, arrival details, private notes, and tokens. We do not subscribe a real family calendar or write directly to Google Calendar or iCloud in this implementation.”

## 3:35-4:15 - Durable coordination continues after booking

**On screen:** Use the labeled synthetic clock to move to three days before arrival. Show the party reconfirmation notifications. Leave one unanswered, move the clock 24 hours, and show one escalation for each host. Cut briefly to the phone again for the escalation email.

**Narration:**

“Coordination does not end when the rooms are booked. I will move the clearly labeled synthetic clock so we can test time without pretending to wait months.

At three days before arrival, the same state machine asks the parties to reconfirm. One party does not answer. Twenty-four hours later, one claimed scheduled job sends exactly one escalation to each host — in the app, and in their inbox. Jobs, notifications, and email pings all use idempotency keys, so retries do not duplicate the alert.”

## 4:15-4:35 - Inside the agent run

**On screen:** Show `docs/submission/assets/agentcore-trace.png` full-screen: the CloudWatch GenAI Observability trace for a capture run, with the agent loop, the model call, and the `execute_tool capture_invitation` span visible. Cut to the run timeline shown earlier at 0:00-0:45, now fully populated.

**Narration:**

“Every one of those runs executed on a live Amazon Bedrock AgentCore Runtime, not just a local process. Here is the actual trace: the agent loop, the call to Sonnet 4.5, and the tool execution, in CloudWatch GenAI Observability. The same run appears on the run status page as a timeline of exactly what happened — every tool call, every policy verdict, every applied decision, in order.”

## 4:35-4:50 - Architecture and agent-first choice

**On screen:** `docs/architecture/layalga-architecture.svg`, then return to the room ledger.

**Narration:**

“Next.js accepts work into a durable run queue and dispatches it to AgentCore. Strands handles natural language, typed tool use, and household memory. Supabase Postgres stays authoritative for rooms, occupancies, visits, decisions, jobs, and audit records.

The current build proves the agent-first workflow without weakening the page, database, or human-confirmation boundaries.”

## 4:50-4:55 - Close

**On screen:** Final room ledger and L’Ayalga title.

**Narration:**

“The agent coordinates, code protects the home, and people keep the judgment that matters.”

## After recording

- Confirm the file is under 300 seconds with `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 <video>`.
- Watch once with sound and once muted. Check that every action is understandable in both modes.
- Check that Spanish and English each appear at least once.
- Check that no guest token, calendar URL, secret, personal notification, private room note, memory record raw payload, or source path is readable.
- Confirm that the WebMCP segment says whether it used the native browser API or the component proof.
- Confirm that the calendar segment says local proof and does not imply a live family-calendar subscription or direct calendar write.
- Confirm the phone cutaways are present only if `EMAIL=ses` was active on the recorded target, and that the narration did not promise an email the target could not send.
- Confirm the trace screenshot and the run timeline segment do not display a family name or a guest link token.
- Record the final video URL in `docs/submission/devpost.md` only after upload authorization.
