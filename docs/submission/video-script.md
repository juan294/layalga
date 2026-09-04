# L’Ayalga three-minute demo script

Target length: 2:55. Hard limit: 3:00.

The three-minute cut keeps the four beats that judges score: capture with memory, real-room boundary, the overflow interrupt with resume, and durable follow-through. WebMCP, the calendar feed, and the architecture diagram become short cutaways. Nothing is claimed that the recorded target cannot show.

## Before recording

- Run `pnpm run demo:e2e -- --base <target>` once, then reset the synthetic demo.
- Run `scripts/seed-memory.ts` (or `pnpm exec tsx scripts/seed-memory.ts`) against the target's `MEMORY_ID` before recording, so the seeded Vega party already has recallable memory; do not write and read in the same take.
- Prepare every input in advance: the second Vega invitation text, the private-use host message, the withheld-room date range, the guest dates and party counts, and the overflow party counts. Typing on camera costs seconds the cut does not have.
- Open one Spanish host tab as Juan and one English host tab as Jordan.
- Open the prepared guest invitation in a separate browser profile or private window.
- Keep the host room ledger above the visit calendar and use a narrow second window for the guest flow.
- Have a phone (or a phone-width browser window on the email inbox) ready to show the host email pings live, if `EMAIL=ses` is active on the target; otherwise skip the phone cutaways and say so in the narration.
- Have `docs/submission/assets/agentcore-trace.png` and `docs/architecture/layalga-architecture.svg` ready to show full-screen.
- Issue the demonstration calendar feed locally before recording and have the parser output ready as a still. Use only the local HTTP and parser proof. Do not subscribe a real Google, iCloud, or family calendar.
- If the recording browser does not provide `document.modelContext`, use a still of the automated WebMCP component proof. Do not enable an unreviewed polyfill or claim native browser execution.
- Confirm that the banner says `Synthetic demo` and that the clock is visibly labeled.
- Close password managers, notifications, bookmarks, and unrelated tabs.
- Keep this script on a second screen. Do not show secrets, terminal history, cloud account numbers, full guest links, calendar bearer URLs, memory record raw JSON, or private source paths.

## 0:00-0:30 - The problem, the authority boundary, and what the house remembers

**On screen:** L’Ayalga title for two seconds, then the host room ledger and visit calendar. Paste the prepared second Vega invitation into the host capture form and submit. Show the run timeline filling in: `search_memory`, then `capture_invitation`. Show the completed summary mentioning the remembered ground-floor preference.

**Narration:**

“This is L’Ayalga, an AI hospitality coordinator for homes with more than one host. Invitations arrive as messages. A calendar cannot tell which rooms fit, whether an overlap is comfortable, or when a person must decide.

The agent interprets and prepares. Code and Postgres decide. People keep the final say.

This family has stayed before. The agent searches what the household remembers, and the summary already reflects their ground-floor preference. No family name ever reached that memory or the model.”

## 0:30-0:55 - Real rooms, private use, and a withheld room

**On screen:** Show the door strip and expand one room: guest label, sleeping arrangement, standard and maximum capacity, inventory state. Submit the prepared host message asking to reserve one room for private use. Show the proposal, press Apply. Then open the withheld room for the prepared date range.

**Narration:**

“The repository holds synthetic rooms only. A host enters the real inventory here, and an incomplete room stays unavailable.

I ask the coordinator to reserve this room for family use. The Strands tool prepares a bounded proposal with exact dates and rooms. Nothing changes until I apply it. And this withheld room opens only for one guest's complete stay.”

## 0:55-1:35 - The guest chooses exact rooms, overflow pauses for a human

**On screen:** Switch to the guest window. Search with the prepared dates and counts. Show that the private room is absent and the opened room is present. Submit the prepared overflow party that fits only at maximum capacity, tick the consent box, submit. Show the run page at "Waiting for a host". Cut to the phone: the pending-decision email. Switch to the host tab, approve, and show the run completing once and the visit confirmed.

**Narration:**

“The guest sees only rooms that are safe for this invitation, with guest-facing labels. Never hidden rooms, private notes, or another family.

This party fits only with the documented overflow arrangement. The policy hook pauses before the booking tool writes anything. Both hosts get an email the moment that happens.

Jordan approves. The saved run reloads current availability, rejects a stale arrangement, and otherwise resumes the paused tool call exactly once. A party above maximum capacity is denied, not escalated.”

## 1:35-2:05 - Durable coordination after booking

**On screen:** Use the labeled synthetic clock: "Reconfirmation chase". Show the reconfirmation request on the guest link and the "Awaiting reconfirmation" chip. Leave it unanswered. Press "Host escalation". Show one escalation per host in the household record and the "Needs attention" chip. Cut to the phone for the escalation email.

**Narration:**

“Coordination does not end at booking. I move the clearly labeled synthetic clock instead of pretending to wait months.

Three days before arrival, the same state machine asks each party to reconfirm. One party stays silent. Twenty-four hours later, one scheduled job sends exactly one escalation to each host, in the app and in their inbox. Idempotency keys mean retries never duplicate an alert.”

## 2:05-2:30 - Private calendar feed and browser agents

**On screen:** Show the feed controls with the URL covered, then the local parser still: generic all-day events, guest count, room labels, and the assertion that private text is absent. Then a five-second WebMCP cutaway: a prepared form with the submit button still waiting.

**Narration:**

“Each host can issue and revoke calendar subscriptions. The database stores only an HMAC of the token. Events say Guest stay or Private room use with counts and room labels. No names, no notes, no tokens. This is a local proof, not a live family calendar.

When a browser provides WebMCP, page tools can read visible state and fill a form. A person still submits.”

## 2:30-2:50 - Inside the run

**On screen:** `docs/submission/assets/agentcore-trace.png` full-screen, then `docs/architecture/layalga-architecture.svg`.

**Narration:**

“Every run executed on a live Amazon Bedrock AgentCore Runtime. Here is the trace in CloudWatch: the agent loop, the Sonnet 4.5 call, the tool execution. Next.js queues the work, AgentCore runs Strands with typed tools and household memory, and Supabase Postgres stays authoritative for every booking fact.”

## 2:50-2:55 - Close

**On screen:** Room ledger, then the L’Ayalga title.

**Narration:**

“The agent coordinates, code protects the home, and people keep the judgment that matters.”

## After recording

- Confirm the file is under 180 seconds with `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 <video>`.
- Watch once with sound and once muted. Check that every action is understandable in both modes.
- Check that Spanish and English each appear at least once.
- Check that no guest token, calendar URL, secret, personal notification, private room note, memory record raw payload, or source path is readable.
- Confirm that the WebMCP cutaway says or shows whether it used the native browser API or the component proof.
- Confirm that the calendar segment says local proof and does not imply a live family-calendar subscription or direct calendar write.
- Confirm the phone cutaways are present only if `EMAIL=ses` was active on the recorded target, and that the narration did not promise an email the target could not send.
- Confirm the trace screenshot and the run timeline segment do not display a family name or a guest link token.
- Record the final video URL in `docs/submission/devpost.md` only after upload authorization.
