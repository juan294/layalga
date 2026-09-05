# Judge guide: evaluating L’Ayalga in ten minutes

This page is for the hackathon judges. It gives a short path through the live site, says what to expect at each step, and points to the code behind each claim. It is organized by the five judging criteria so it can be scored from directly.

Live site: `https://layalga.thecreativetoken.com`. Everything you will touch is synthetic demo data, labeled as such. The two host names are the real operators; every guest, invitation, and message is invented.

Companion documents: the [pitch](pitch.md), the [Strands usage inventory](strands-usage.md), the [system guide](system-guide.md), the [architecture diagrams](../architecture/README.md), and the [host](../guides/host-manual.md) and [guest](../guides/guest-manual.md) manuals.

---

## The ten-minute path

Use two browser windows: one for the host, one private window for the guest.

**Minute 0 to 2: enter and capture.** Open the site, press "Enter as Host" (no Google account needed). Switch the language at the top if you prefer Spanish. In "New invitation", paste any informal invitation, for example: "Invite the Vega family from 18 to 21 September, two adults, two kids, and their dog." Press "Capture invitation". A progress page shows the run's timeline as it happens: "Recall household memory" (the Vega family has stayed before, so the house recalls their ground-floor preference), then "Capture invitation", then "Executed on AgentCore". Back on the host page, press "Prepare private guest link" and copy it.

**Minute 2 to 4: rooms.** In the room ledger, type in "Agent room request": "Reserve the Garage Room for private use from 22 to 24 September." Press "Prepare proposal". A proposal appears with exact dates and rooms. Nothing has changed yet. Press "Apply". The Garage Room now shows "Private" for those dates.

**Minute 4 to 7: the guest and the human exception.** In the private window, open the site and press "Enter as Guest". This opens the seeded Otero invitation in English, prefilled with a stay from 19 to 21 September, two adults, one dog, and a special request about ground-floor access for a wheelchair. Those are the dates the demo clock is tuned to. Press "Find available stays", pick a stay, keep the recommended room, and submit. Because the notes carry a request that needs a human answer, the run page shows "Waiting for a host". In the host window, a card appears in "Pending decisions" with the request in the guest's words, and both hosts receive an email. Approve it, optionally with a note. The saved run resumes once and the guest's page shows "Your stay is confirmed". To see the overflow variant instead, set the party to five adults before searching and choose the Guest Room and the Garage Room together; the consent box for the extra sleeping arrangement appears and the decision card names the exact rooms. A request that breaks a house rule, for example a second family with children on the same dates, is refused on the spot with a plain explanation and no host is asked.

**Minute 7 to 9: time.** In the host window, use the labeled demo clock: press "Reconfirmation chase", which moves the house clock to the morning of 15 September, three days before the seeded stays. The guest's link now asks "Please confirm that you are coming" and the calendar shows "Awaiting reconfirmation". Leave it unanswered and press "Host escalation", which moves the clock 24 hours on. The household record shows one escalation per host and the calendar shows "Needs attention". Both hosts receive a second email.

**Minute 9 to 10: memory and the record.** Open "What L’Ayalga remembers" to see the Vega family's records, written as household preferences with no name. Scroll the household record to see every tool call and policy verdict in order.

---

## Scoring by criterion

### 1. Technical implementation: use of Strands Agents

What to look for, and where:

| Claim                                                                                                    | Where to see it live                                             | Where it lives in code                                                                              |
| -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| One Strands `Agent` with ten typed tools, a Postgres session manager, and memory                         | The run timeline lists tool names                                | `src/agent/agent.ts`, `src/agent/tools/*.ts`, `src/agent/deps.ts`                                   |
| A `BeforeToolCallEvent` hook gates every consequential tool                                              | "Policy checked" and "Host review required" rows on the timeline | `src/agent/policy-hook.ts`                                                                          |
| `event.interrupt` pauses before the tool writes; resume uses `InterruptResponseContent` and applies once | The pending decision card, then "Host decision applied"          | `src/agent/run-task.ts`, `src/agent/host-decision-context.ts`, `src/agent/interrupt-resume.test.ts` |
| Session snapshots in Postgres survive a process restart                                                  | The resume happens in a different run, minutes or hours later    | `src/agent/storage/postgres-storage.ts`                                                             |
| `MemoryManager` over AgentCore Memory with tool-driven recall                                            | "Recall household memory" on the timeline; the memory panel      | `src/agent/memory.ts`, `src/agent/record-capture-memory.ts`                                         |
| Every run executes on Amazon Bedrock AgentCore Runtime                                                   | "Executed on AgentCore" on every run                             | `src/agent/runtime/agentcore.ts`, `src/agent/runtime/handler.ts`, `scripts/deploy-agentcore.sh`     |
| ADOT traces to CloudWatch GenAI Observability                                                            | `assets/agentcore-trace.png`                                     | `scripts/deploy-agentcore.sh`, `src/agent/telemetry.test.ts`                                        |

The full inventory with snippets is in [strands-usage.md](strands-usage.md).

### 2. Design: a complete product, not a proof of concept

- Two languages from the first screen, including every agent-written message.
- A host page that covers rooms, calendar, decisions, capture, email consent, memory, and history.
- A guest page with search, exact rooms, overflow consent, run status, reconfirmation, change requests, and an optional Google-linked account with a visits page.
- Revocable calendar subscription feeds for the hosts' phones.
- Nine automated release probes run against production before every release, including a concurrent double-booking attempt and an interrupt-and-resume cycle.

### 3. Potential impact

The problem is lived: two real hosts, one real house, invitations that arrive by message from both sides. The pitch generalizes one step to any home with more than one host and stops there. Read section 2 of the [pitch](pitch.md).

### 4. Creativity and originality

- Partial overlap at the room and date level, not a busy flag on the house.
- Two hosts inviting independently, reconciled by the agent.
- Human approval only for social exceptions: impossible requests are denied by code, routine ones proceed, and only a special request or an overflow arrangement pauses for a person.
- Coordination continues after booking: reconfirmation and escalation are the product, the calendar is the by-product.
- Memory that remembers a family's habits and never its name.

### 5. Presentation

The video is three minutes and shows all four beats on the live site. The script is in [video-script.md](video-script.md). The architecture diagram is in `docs/architecture/`.

---

## What the judges should not expect

- No WhatsApp or SMS. Hosts share the link through their own channel.
- No writes into Google or Apple calendars. The feed is a one-way subscription.
- No per-visit relaxation of the three house rules.
- The demo clock exists only on the demo house so time-driven behavior can be shown in minutes.

---

## If something looks wrong

- A run that stays on "Working" for more than a minute is usually an AgentCore cold start. The page keeps polling and shows a "Check status" button.
- If the demo data looks used up (rooms already private, decisions already answered), the hosts can reset the synthetic demo. Ask, or try again with different dates.
- The two host email pings only arrive at the real hosts' inboxes; the site shows the same information in "Pending decisions" and the household record.
