# L’Ayalga pitch: Everyday Agents track

Track text, as published: "Everyday Agents: an agent that takes the busywork out of daily life, home, money, health, errands, family. The best ones run quietly in the background and only ping you when there's a real decision to make."

That sentence is L’Ayalga's design brief. This document is the pitch for that track, built to be read by a judge in three minutes and reused, sentence by sentence, in the video, the Devpost description, and the builder.aws posts.

---

## 1. The pitch in one breath

Two people share a country house. Friends and family get invited by message, by each of them, independently. L’Ayalga is the agent that takes every one of those invitations, turns it into a private link, finds dates and rooms that fit with everyone already coming, confirms the stay, follows up before arrival, and pings the hosts only when a decision needs a human. It runs on Amazon Bedrock AgentCore with the Strands Agents SDK, and it is live today at layalga.thecreativetoken.com with the two real hosts operating it.

---

## 2. The problem, the audience, and why it matters

**The problem.** A home with more than one host has a coordination problem that calendars do not solve. "Come the second weekend of October, bring the kids" arrives on one host's phone. "Sure, that long weekend works" leaves the other host's phone the same week. Both are right, and both are half wrong: the dates overlap partly, one family brings children, the other brings a dog, the sofa bed is the only way five people fit, and one of the guests would rather not share the house with strangers. Every one of those questions today is a thread of messages between the hosts, then between each host and their guest, then back again. The busywork is not the calendar entry. It is the fifteen messages around it, repeated for every invitation, all season.

**The audience.** Any home with more than one host. Two partners with different friend groups. Siblings who inherited a house and share it with their families. Co-parents with a shared holiday flat. A friend group with a cabin. The house in this project is real and so are its two hosts; the pattern is not rare, it is just unserved, because every existing tool assumes one owner and one calendar.

**Why it matters.** Hospitality is one of the last daily-life chores that people still do entirely by hand, because it is social. The moments that need a person are real: is this combination of guests comfortable, is the sofa bed acceptable for this family, do we say yes to the wheelchair on the ground floor. Everything around those moments is mechanical, and it currently steals the time and goodwill that should go to the guests. An agent that removes the mechanical part without touching the human part makes people better hosts, not just faster ones.

---

## 3. How L’Ayalga matches the track, clause by clause

**"Takes the busywork out of daily life."** The host's entire job shrinks to what it was before software: invite someone, in whatever channel, in whatever words. L’Ayalga reads the message, structures it, remembers what the house already knows about that family, creates a private link, and hands it back. From then on the guest self-serves against real availability, room by room, and the agent confirms, reallocates, and follows up.

**"Home, family."** It is literally the home and literally the family. The two hosts are a couple. The guests are their friends, siblings, cousins, parents. The rules it enforces are household rules: how many beds, one family with children at a time, whether two dogs can share the garden.

**"Handle it end to end."** The loop closes. Invitation in, structured party out. Guest link, date search, exact room selection, capacity check, hold, confirmation. Three days before arrival, an automatic reconfirmation request. Twenty-four hours of silence, an escalation to both hosts. A change request from the guest, a reschedule that goes back through the same rules. A calendar feed on each host's phone as the output. Nothing in that chain requires a host to type anything.

**"Run quietly in the background."** Every agent run is queued, executed on Amazon Bedrock AgentCore Runtime, and recorded. The reconfirmation and escalation timers run on a per-minute schedule with retries and safe replays, so a crashed request never loses accepted work and a retried job never sends a duplicate. The hosts do not watch it. They open the page when they invite someone, and otherwise they see stays appear on their calendar.

**"Only ping you when there's a real decision to make."** This is the heart of the design, and it is enforced by code, not by a prompt. Three deterministic rules run before any booking tool: enough beds, at most one family with children, no overlapping pets unless the house allows it. If a request breaks a rule, it is denied on the spot with a plain explanation to the guest, and no host is asked, because there is nothing to decide. If it passes, it proceeds, and no host is asked, because there is nothing to decide. Only in two situations does the agent pause: the guest wrote a request that needs a human answer, or the party fits only with an overflow sleeping arrangement. Then a Strands interrupt stops the run before the tool writes anything, a decision card appears on the host page, and both hosts get one email. They approve or decline, with a note, and the saved run resumes exactly once. The other ping is the escalation when a family goes quiet before arrival. That is the complete list of times a host is interrupted.

---

## 4. Why this is a Strands agent and not a form with a chatbot

Judges score how thoroughly the project uses Strands Agents. L’Ayalga uses the SDK for the parts where an agent earns its keep, and refuses to use it for the parts where it would be dangerous.

- **The model interprets.** It reads informal Spanish or English, structures the party, chooses among ten typed tools, and writes bilingual messages to guests and hosts.
- **A hook decides.** A `BeforeToolCallEvent` hook runs the household policy before every consequential tool. It can allow, deny, or interrupt. The model cannot skip it and cannot approve its own request.
- **An interrupt pauses, and the pause survives.** The session snapshot lives in Postgres. A host decides hours later, from an email, on a phone. A new run restores the session, supplies the decision, and the paused tool executes once. This is the SDK's interrupt and resume contract used as a product feature, not a demo trick.
- **Memory recalls without leaking.** Strands `MemoryManager` over AgentCore Memory gives each returning family its own namespace of preferences and facts. Recall is an explicit tool call the agent must make, it is audited, and no family name is ever written to memory or sent to the model. A host can read and erase everything remembered about a family.
- **Every run is visible.** ADOT tracing sends each agent cycle, model call, and tool call to CloudWatch GenAI Observability, and the same run appears in the app as a timeline: every tool, every policy verdict, every applied decision, and the runtime it executed on.

The database owns availability, holds, and visits, with a PostgreSQL exclusion constraint that makes double-booking a room impossible even under concurrent requests. The model never touches booking state directly. That split is why the agent can be trusted with a real house.

---

## 5. What makes it original

- **Partial overlap is a first-class concept.** Rooms and date ranges, not a busy flag on the house. Two families can be confirmed for the same weekend without either knowing who the other is.
- **Two hosts, inviting independently.** The agent reconciles invitations from two people who did not consult each other, in two languages.
- **Human approval only for social exceptions.** Impossible requests are refused deterministically. Possible-but-sensitive requests are the only ones that reach a person. The line between them is a pure function, versioned in code.
- **Coordination continues after booking.** The proactive reconfirmation and escalation are the product; the calendar is a by-product.
- **Memory that forgets the name.** The house remembers that a family prefers the ground floor and arrives late on Fridays, and nothing else about who they are.

---

## 6. Proof that it is real

- Live at `https://layalga.thecreativetoken.com`, operated by the two real hosts, with synthetic guests for the demo.
- Every production run since 2026-09-03 executed on Amazon Bedrock AgentCore Runtime with Claude Sonnet 4.5 on Bedrock, and each run records that fact.
- Nine automated release probes run against production before every release: health, capture, confirmation, a concurrent double-booking attempt where exactly one wins, interrupt and resume applied exactly once, clock-driven reconfirmation with exactly two host escalations and two emails, exact room coordination with a calendar event, guest isolation, and cleanup. All nine passed for the current release.
- English and Spanish from the first screen, including every agent-written message.
- Public repository under MIT, architecture diagram, README, and a three-minute video that shows all four beats on the live site.

---

## 7. Honest scope

L’Ayalga does not send WhatsApp or SMS, does not write into Google or Apple calendars (the feed is a one-way subscription), and does not let hosts relax the three house rules per visit. Each of those is a deliberate cut: the first two need consent and identity work that a hackathon should not fake, and the third would move a safety rule from code into judgment. The demo uses labeled synthetic guests and a labeled synthetic clock so that time-driven behavior can be shown in three minutes without pretending.

---

## 8. Ready-made versions

**Thirty seconds.** "L’Ayalga is an AI coordinator for homes with more than one host. Paste an invitation, send the private link, and the agent finds dates and rooms that fit with everyone else, confirms the stay, and follows up before arrival. Code enforces the house rules. The hosts are pinged only when a guest's request needs a human answer. It runs on Strands and Amazon Bedrock AgentCore, and it is live."

**Sixty seconds.** Add: "Two hosts invite people independently, in two languages. Rooms and dates overlap partly, not as a busy flag. Three rules run before any booking tool: enough beds, one family with children at a time, no overlapping pets. Impossible requests are refused on the spot. Sensitive ones pause the agent with a Strands interrupt, both hosts get one email, and the run resumes once after the decision. Three days before arrival the house asks the family to reconfirm; a day of silence escalates to the hosts. The house remembers each family's habits, never their name."

**Two minutes.** Use sections 2, 3, and 4 in order, one paragraph each, and close with: "The agent coordinates, code protects the home, and people keep the judgment that matters."

---

## 9. Lines to reuse verbatim

- "The best ones run quietly in the background and only ping you when there's a real decision to make." That is the brief. This is the agent.
- "Denial is deterministic. Approval is human. Everything else is automatic."
- "Partial overlap is a first-class concept, not a busy flag."
- "The interrupt pauses before the tool writes, survives a restart, and resumes exactly once."
- "The house remembers the family's habits, never the family's name."
- "The calendar is the result of coordination, not the product."
- "The agent coordinates, code protects the home, and people keep the judgment that matters."
