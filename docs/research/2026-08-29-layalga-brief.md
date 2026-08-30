# Design Brief: L'Ayalga

> Brainstormed on 2026-08-29. Derived from the approved assessment
> (`docs/research/2026-08-29-agents-for-humans-hackathon-assessment.md`) plus
> the owner's decisions recorded the same day. A full brainstorm session was
> skipped deliberately: the assessment already fixed problem, scope, approach,
> and success criteria. This brief adds the decisions that document lacked.

Evidence labels: VERIFIED = read or executed this session, source cited.
DECIDED = owner decision 2026-08-29. ASSUMED = reasonable default the owner has
not confirmed; override in `/plan`.

## Problem

A shared home with more than one host (a family country house, an inherited
house between siblings, a friend group's cabin) receives invitations from each
host independently, over WhatsApp, voice, or in person. Nobody holds the single
calendar. Consequences: two families arrive the same weekend without either
host having decided that was fine; guests who were invited informally never
confirm dates; the week before arrival nobody reconfirms and beds, food, and
pickups are guessed. Today the hosts coordinate by memory and group chats.

Why now: the AWS "Agents for Humans" hackathon (Everyday Agents track,
Strands Agents SDK mandatory, submission deadline 2026-09-14 17:00 PDT) is the
forcing function, and the problem is lived by the owner, which is the
credibility asset for the Potential Impact score.

## Goal

An agent that takes a shared home from informal invitation to confirmed,
reconfirmed arrival, deciding the routine cases itself and asking the hosts
only when a social exception needs a human decision.

## Scope

**In (DECIDED unless labeled):**

- Two hosts, one home, one calendar. Either host captures an invitation by
  pasting or dictating the informal message; the agent structures it into a
  tentative request.
- A private guest link where the guest converts flexible plans into dates,
  provides party details (adults, children, pets, arrival time), and requests
  changes. Temporary hold, then confirmation.
- Overlap policy with exactly three deterministic rules: bed capacity; at most
  one family with children at a time; pets together allowed yes/no. Anything
  outside those three raises a Strands interrupt and asks both hosts.
- Proactive reconfirmation: at T-3 days the agent chases the guest. If the
  guest has not answered, both hosts are escalated to. (Chase at T-3 is
  DECIDED; the escalation window, 24 hours after the chase, is ASSUMED.)
- Authentication: Google sign-in for hosts and for guests, plus a guest option
  that does not require an account (link-token access). DECIDED.
- Languages: English and Spanish from the first commit, for both host and guest
  surfaces. DECIDED.
- Injectable clock and an explicitly labeled synthetic demo mode, built from
  day one, never exposed in the normal product.
- Deliverables: public MIT repo (VERIFIED: https://github.com/juan294/layalga,
  created 2026-08-29T13:11:54Z, inside the submission window), README,
  architecture diagram, 5-minute video with the four-beat demo, optional live
  demo link, up to three builder.aws posts once the demo is stable.

**Out:**

- WhatsApp, Twilio, SMS, or email delivery integrations. Hosts share the
  generated link through their existing channel.
- An opaque compatibility score, or any overlap rule beyond the three above.
- Aurora, DynamoDB, or any datastore chosen for the diagram rather than the
  problem.
- Blanket 100% coverage thresholds and the full per-phase worktree gate. RPI is
  kept for implementation (DECIDED); test targets are the five listed under
  Success Criteria.
- Multi-home support, more than two hosts, payments, pricing.

## Constraints

- Strands Agents SDK is mandatory. TypeScript SDK supports typed tools,
  interrupts, session management (VERIFIED in the assessment sources).
- AWS account 106403001709, IAM user `archy`, AdministratorAccess, region
  us-east-1, local AWS CLI 2.36.34 (VERIFIED this session via
  `aws sts get-caller-identity`, `aws iam list-attached-user-policies`).
- Bedrock entitlement (VERIFIED by `bedrock-runtime converse` this session):
  `us.anthropic.claude-sonnet-4-5-20250929-v1:0` and
  `us.anthropic.claude-haiku-4-5-20251001-v1:0` respond. Claude 5 family
  models are listed but return `AccessDeniedException: not available for this
  account`. Build on Sonnet 4.5; do not plan around Claude 5 on Bedrock.
- AgentCore control plane is reachable and empty: no runtimes, no memories, no
  EventBridge schedules (VERIFIED via `bedrock-agentcore-control
  list-agent-runtimes`, `list-memories`, `scheduler list-schedules`).
- AWS Builder ID: a consumer identity separate from IAM, not creatable by CLI.
  Needed for Devpost submission, not for the build. Owner action, any day before
  submission.
- Solo builder, start 2026-08-29, 16 calendar days. The WebMCP hackathon
  (Chapa) is due 2026-09-03 and competes for the first five days.
- Repo topology: `main` only, PR flow, direct pushes to `main` blocked by the
  repo hook. cc-rpi v1.28.2 scaffold disclosed in the README as pre-existing
  tooling.
- Product URL layalga.thecreativetoken.com; no DNS or deployment exists yet.
- No emojis in documentation.

## Chosen Approach

One Strands coordinator agent with about six typed tools
(`capture_invitation`, `find_visit_options`, `create_temporary_hold`,
`evaluate_overlap`, `confirm_visit`, `schedule_reconfirmation`) over a
deterministic booking engine in Postgres. A hook or policy layer, not the
model, decides when an interrupt is required before a sensitive action; the
model never chooses whether to ask.

Runtime: AgentCore Runtime is preferred because the rules state it strengthens
the Technical Implementation score, but it is optional and must not consume
the schedule. Day one is a timeboxed spike: deploy the TypeScript agent,
trigger an interrupt, resume it, and persist the session. If the spike passes,
AgentCore Runtime plus EventBridge Scheduler for reconfirmation ticks. If it
fails, keep TypeScript, model approval as a persisted `pending_decision` row
plus a resume tool, and deploy the agent on a simpler path. Record the verdict
before any feature work.

UI: Next.js, one host view (both hosts, one calendar, pending decisions) and
one guest link page, Paper Ink aesthetic, i18n en/es, Google sign-in.

Rejected alternatives:

- Python Strands rewrite: only if the TypeScript AgentCore path fails and the
  `pending_decision` fallback is also unacceptable. Costs days, earns no
  judge credit by itself.
- DynamoDB or Aurora Serverless: date-range overlap is SQL work; nobody scores
  the database.
- A rich overlap rule set (privacy, accessibility, arrival times, per-host
  preferences): unbounded, and it delays the interrupt that the demo needs to
  show early.
- Messaging integrations: a day of plumbing that moves the agentic loop out of
  frame.

## Success Criteria

Automated, each a targeted test:

1. Overlap policy: for every combination of the three rules the function
   returns allow, deny, or interrupt exactly as specified, and any request
   outside the three rules returns interrupt.
2. Holds and concurrent confirmation: two confirmations racing for the last
   bed produce one confirmed visit and one rejection, never two.
3. Interrupt and resume: a host decision raised mid-run is persisted, the agent
   stops, and the run resumes with the decision applied, across a process
   restart.
4. Rescheduling: a guest date change re-evaluates the policy and re-raises an
   interrupt when the change crosses a rule.
5. Clock-driven reconfirmation: with the injectable clock at T-3 the guest is
   chased; at T-3 plus the escalation window with no answer both hosts are
   notified; with an answer nothing escalates.

Manual, the four-beat demo recorded in under five minutes:

1. Host A pastes an informal invitation; the agent structures it.
2. The guest opens the link, picks dates, a hold is placed and confirmed.
3. Host B independently invites a second family with partial overlap; the
   three rules pass; one social exception raises an interrupt; a host approves
   in the host view.
4. Clock warp to T-3; the guest does not answer; the agent escalates to both
   hosts per policy.

Submission complete: public MIT repo, README with disclosure, architecture
diagram, video, Devpost entry filed before 2026-09-14 17:00 PDT.

## Open Risks

- AgentCore Runtime with the TypeScript interrupt/resume/session path is
  unverified. Mitigated by the day-one timebox and the recorded fallback.
- Schedule: five of sixteen days overlap with the Chapa WebMCP deadline. The
  four-beat demo must be end-to-end before any builder.aws writing starts.
- Escalation window (24 hours) is ASSUMED, not decided.
- House inventory (rooms, beds, pet policy) is seed data the hosts configure;
  the demo seed values are fixed in `/plan`, not here.
- Claude 5 on Bedrock is not entitled; if the account is upgraded later, the
  model id is a config value, not a redesign.
- Google sign-in for guests plus link-token access widens the auth surface.
  Keep the guest link the primary path and Google optional so the demo never
  depends on OAuth in a recorded session.

## Next step

`/plan` in the layalga repository against this brief, with the four-beat demo
as the acceptance criterion and the AgentCore spike as Phase 0.
