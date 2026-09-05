# Assessment: Country House Hospitality Agent for the AWS "Agents for Humans" hackathon

Documentation status, September 5, 2026: Historical snapshot: the observations, open items and recommendations below describe the recorded date and revision. Current product behavior and remaining work supersede this snapshot in the [roadmap](../roadmap.md) and [judge guide](../submission/judge-guide.md).

Date: 2026-08-29
Sources:

- <https://agentsforhumans.devpost.com/> (main, /rules, /details/dates fetched
  2026-08-29)
- <https://github.com/strands-agents/harness-sdk/blob/main/strands-ts/README.md>
- <https://github.com/strands-agents/harness-sdk/blob/main/site/src/content/docs/user-guide/concepts/interrupts.mdx>
- <https://github.com/strands-agents/harness-sdk/blob/main/site/src/content/docs/user-guide/concepts/agents/session-management.mdx>

Evidence labels: VERIFIED = read in an official source this session. INFERRED =
reasoned judgment not stated directly by those sources.

## Verdict

Go. The idea is genuinely differentiated and the problem is real and lived. The
document as written is a six-week product spec; the hackathon needs a 16-day
build with a five-minute demo. The changes below are about what judges score,
not about lack of time.

## Hackathon facts (VERIFIED)

- Sponsor: AWS. Online, public. 5,880 participants at time of reading.
- Submission period: Aug 10 - Sep 14, 2026, 5:00pm PDT. Judging Sep 15 - Oct 8.
  Winners Oct 14.
- Tracks: Everyday Agents (home, money, health, errands, family), Professional
  Agents, Good Neighbor Agents. Each track: Gold $5,000, Silver $3,000,
  Bronze $2,000. Grand Prize $10,000 across all tracks. $40,000 total.
- Required: Strands Agents SDK (mandatory), AWS account, AWS Builder ID.
  Amazon Bedrock AgentCore is optional but the rules state it strengthens the
  Technical Implementation score.
- Judging: five criteria, equally weighted: Technical Implementation
  ("thoroughness of Strands Agents use; live demo / AgentCore deployment
  strengthens score"), Design, Potential Impact, Creativity & Originality,
  Presentation.
- Bonus: up to +0.6 for builder.aws.com posts published before the deadline
  (0.2 each, max 3).
- Submission: public repo (GitHub/GitLab/Bitbucket) with MIT or Apache license,
  README, architecture diagram, text description, demo video max 5 minutes with
  pitch covering problem / audience / importance. Optional live demo link.
- "Projects must be newly created during the Submission Period." Standard
  development tools allowed; any pre-existing code incorporated must be
  disclosed.
- No explicit team-size limit. Eligibility excludes a list of countries; Spain
  is not on it.

## Positioning read

Everyday Agents is the right track. It is plausible that it will attract many
"household coordinator" or "family scheduling" entries, but this is INFERRED:
5,880 is the registration count for the whole hackathon, not the number of
submissions or the distribution by track. The differentiators that a generic
entry is unlikely to have are: two hosts inviting independently, partial
overlap as a first-class concept, and human approval only for social
exceptions. Lead every pitch surface with those three.

## Where the document is weak

### 1. The current pitch underemphasizes the agentic loop

Rooms, beds, buffers, blocked dates, and maximum simultaneous guests belong in
a deterministic booking engine. That is a strength: availability and booking
state must be reliable rather than inferred by a model. However, Technical
Implementation is explicitly scored on "thoroughness of Strands Agents use",
and a judge can still read the current design as a form with a chatbot in front
of it if the agentic loop is not made visible.

The genuinely agentic surfaces are: chasing an unresponsive guest according to
a policy, negotiating a reschedule against consequences, and pausing for a host
decision via an interrupt. The document treats reconfirmation as "central" in
one line and then spends most of its length on the calendar. Invert that. The
proactive loop and the interrupt are the product; the calendar is an output.

### 2. The product needs both host capture and guest completion

Some friends will use a private link; others will continue to contact a host
directly by WhatsApp, voice, or conversation. The product must support both
paths. On the host side, either host can paste or dictate the invitation or
guest message, and the agent structures it into a tentative request. On the
guest side, the private link remains a real product surface for confirming
dates, providing details, and requesting changes.

The guest link also shows the end-to-end loop cleanly in the demo. Be honest in
the write-up that host capture is necessary because not every guest will start
there. Do not add Twilio or WhatsApp integration for this submission. The host
can share the generated link through their existing channel, while the agent
owns the coordination that follows.

### 3. The overlap rule set is a policy engine in disguise

"Explicit facts, not an opaque compatibility score" is the right principle.
But the fact list (privacy preferences, accessibility, arrival times, per-host
overlap rules, whether guests accept another group...) grows without bound.

Cut to three rules:

- bed capacity
- max one family with children at a time
- pets together allowed: yes/no

Everything outside those three raises an interrupt and asks both hosts. This is
a roughly 30-line function, and it demos better because the interrupt fires
sooner and more visibly.

### 4. Nine demo steps in five minutes is too many

Four beats:

1. Host A captures an informal invitation.
2. Guest converts it to dates via the link; hold placed, confirmed.
3. Host B independently invites a second family; partial overlap; the routine
   checks pass; the one social exception raises an interrupt; host approves.
4. Clock-warp to the reconfirmation chase; guest does not answer; agent
   escalates to hosts per policy.

Build an injectable clock and an explicitly labeled synthetic demo mode from
day one. Do not expose time manipulation in the normal product. Without a safe
clock control, the proactive follow-through, which is the strongest part of the
story, cannot be shown reliably.

### 5. Impact framing reads narrow

"Our country house" will read to some judges as a comfortable-people niche.
Generalize one step and stop: any home with more than one host. Co-parents,
siblings sharing an inherited house, a friend group with a shared cabin. Do not
overclaim beyond that; the credibility of the lived problem is the asset.

### 6. Strands TypeScript support is verified; AgentCore integration is not

The official TypeScript SDK and documentation include typed tools, interrupts,
session management, Graph, and Swarm support (VERIFIED). The remaining unknown
is whether the chosen TypeScript interrupt, resume, session, and deployment
path works cleanly on AgentCore Runtime. Verify that integration in a
timeboxed day-one spike. If it fails, keep TypeScript and model approval with a
persisted `pending_decision` row plus a resume tool before considering a Python
rewrite.

### 7. Decide AgentCore with a timeboxed day-one spike

The rules state that AgentCore strengthens the Technical score. Attempt an
AgentCore Runtime deployment on day one and give it a fixed time budget. Use it
if the TypeScript path works cleanly; otherwise choose a simpler live deployment
and protect the working demo. AgentCore is optional, and optional infrastructure
must not consume the submission schedule. AgentCore Memory or Strands sessions
may hold conversational and interrupted-workflow context, but neither replaces
the authoritative booking database.

### 8. The blog bonus is valuable but secondary to the demo

Three builder.aws posts can add up to +0.6 for submissions that reach Stage Two.
Candidate topics: "Interrupts for household decisions", "A deterministic policy
layer under an agent", "Proactive follow-through with a controllable clock".
Capture notes and draft the posts as the pieces are built, but stabilize the
end-to-end demo before spending time on publication. Publishing the posts is a
separate outward-facing authorization gate.

### 9. Production habits are the wrong gear for this repo

100% coverage thresholds, full RPI phase gates, and a worktree per small phase
are correct for Archy but expensive here. Bootstrap the repo from cc-rpi for the
scaffolding, then use a lightweight workflow without a blanket coverage target.
Keep targeted tests for the three-rule overlap policy, holds and concurrent
confirmation, interrupt and resume, rescheduling, and the injectable clock.
Disclose cc-rpi as pre-existing tooling in the README.

## Recommended build

- One Strands coordinator agent with about six typed tools: capture_invitation,
  find_visit_options, create_temporary_hold, evaluate_overlap, confirm_visit,
  schedule_reconfirmation. A deterministic policy or hook raises an interrupt
  before a sensitive action; the model must not decide whether approval is
  required by selecting or skipping a request_host_decision tool.
- Database: Postgres. Date-range overlap queries are SQL's home turf; DynamoDB
  would cost a day for zero judge credit. Supabase is acceptable; nobody scores
  the database. Do not choose Aurora Serverless only to make the architecture
  diagram look more AWS-native.
- Preferred agent runtime: AgentCore Runtime, subject to the timeboxed day-one
  TypeScript deployment spike. Keep a simpler live-deployment fallback.
  Reconfirmation ticks: EventBridge Scheduler. The archy AWS CLI profile
  already exists.
- UI: Next.js. One host view (both hosts, one calendar, pending decisions), one
  guest link page. Paper Ink aesthetic makes it look finished cheaply.
- Demo data: seeded synthetic guests, controllable clock.
- Verification: targeted tests for policy decisions, booking concurrency,
  interrupt and resume, rescheduling, and clock-driven reconfirmation.
- Deliverables: public repo (MIT), README, architecture diagram, 5-minute video,
  optional live demo link, and up to three builder.aws posts after the demo is
  stable and publication is authorized.

## Honest tension

For actual household use, the valuable pieces are shared capture, one calendar,
and reconfirmation. The overlap engine will not earn its keep until several
seasons of data exist. For the hackathon, the overlap engine is the creativity
hook. Build it minimal (three rules plus interrupt), build the capture and
reconfirmation loop properly, and both goals are served.

## Next steps

1. Timebox an AgentCore TypeScript spike covering deploy, interrupt, resume, and
   session persistence. Record the fallback decision before feature work.
2. /brainstorm to turn this into a design brief with the cuts applied.
3. /plan with a four-beat demo as the acceptance criterion.
