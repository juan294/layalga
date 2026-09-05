# Data lifecycle

L’Ayalga keeps booking state in PostgreSQL and sends task prompts to Amazon Bedrock only when the non-scripted model is active. The scripted model stays in process. Prompt construction omits known host-display and family-name fields, guest contact addresses, private capabilities, and informational arrival/note fields supplied through trusted booking state. This is field minimization, not a guarantee that arbitrary free text contains no personal information: raw invitation and change-request text can name people and can reach the model provider and traces. Do not use real private household information in the synthetic demo.

This boundary does not claim that the model provider stores nothing. AWS account settings, service logging, and provider terms remain an operator responsibility. The application stores its own Strands session snapshots in `agent_sessions` and applies the policy below.

## Automatic policy

Supabase Cron calls `private.apply_data_retention()` daily at 03:17 UTC.

| Data                                                    | Boundary                                                                                                                                                                     | Action                                                                          |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Completed or failed run payload and result              | 30 days after completion                                                                                                                                                     | Replace payload with `{}` and remove result                                     |
| Terminal agent session snapshots                        | 30 days after the last write                                                                                                                                                 | Delete snapshot                                                                 |
| Converted or cancelled invitation message and structure | 180 days after capture, when no active visit, open job, pending decision, or failed decision application depends on it                                                       | Replace text with an empty string and structure with `{}`                       |
| Special requests and informational `visits.guest_notes` | 180 days after the stay ends for cancelled or reconfirmed visits, when no open job or unresolved decision depends on it                                                      | Remove special requests and clear notes                                         |
| Notification bodies                                     | 180 days, when no open scheduled job depends on the notification                                                                                                             | Replace both language bodies with expiry markers                                |
| Audit payload detail                                    | 365 days                                                                                                                                                                     | Replace payload with `{}`; retain actor, kind, time, home, and run relationship |
| Host email ping rows                                    | 90 days after creation                                                                                                                                                       | Delete the row                                                                  |
| Guest email outbox and attempt receipts                 | 90 days after outbox creation                                                                                                                                                | Delete outbox; attempt receipts cascade                                         |
| Guest reminder contacts                                 | Last contact update older than 180 days; invitation cancelled, access expired over 180 days ago, or a stay ended over 180 days ago; no noncancelled recent or unbounded stay | Delete contact and dependent delivery records                                   |
| Cron execution detail                                   | 30 days                                                                                                                                                                      | Delete execution detail                                                         |

Prompt/session cleanup preserves running or interrupted work, unresolved decisions and the sessions/jobs those states need. The existing booking-content sweep excludes synthetic homes. The added guest-contact/outbox retention uses the explicit rules above; synthetic contact enrollment is disabled independently. See migrations [guest notes](../../supabase/migrations/20260905000300_guest_notes.sql), [guest delivery](../../supabase/migrations/20260905000500_guest_delivery.sql) and [attempt receipts](../../supabase/migrations/20260905000600_guest_delivery_attempts.sql).

Home, host, party, invitation, visit, decision, job, and audit identity rows remain as relationship and accountability evidence until explicit household deletion. Unbooked bearer access starts at 30 days. Confirmation, rescheduling and reissue preserve access through at least finite checkout plus seven days; shortening a stay need not shorten an already valid link. Revocation and cancellation remain authoritative. No plaintext original bearer is stored or reconstructed.

The retention function is in the unexposed `private` schema. The web and agent roles cannot execute it directly. PostgreSQL Cron runs it through the database maintenance boundary.

## Durable execution metadata

An accepted agent request creates a `runs` row before execution. Queued and running rows retain the minimum task envelope, lease, attempt count, and idempotency key needed for recovery. Terminal prompt and session data follows the retention rules above. Audit metadata remains so an operator can explain the outcome without retaining private message text.

Invitation URLs are capabilities. The database stores an invitation-scoped HMAC, not a reusable plaintext token. Reissuing a link invalidates the prior capability. Claiming an invitation to an authenticated guest account adds a durable identity relationship but does not copy the link token into account data.

Guest or host cancellation requires review and an explicit authorized mutation. Cancellation releases occupancy and retires pending work; withdrawal before a visit exists prevents stale queued or approved work from creating it. Informational notes are separate from explicit approval requests, bounded to 1,000 characters, and visible to the same guest and authorized hosts. They use the existing visits grants, but are excluded from model prompts and memory input. Host policy updates validate pets-together and a 1–20 overlapping-families limit, compare an expected version, audit real changes, and serialize with booking. They do not rewrite confirmed stays.

## Guest contact, consent and return capabilities

The September 5 guest email implementation is locally verified; production migration/IAM rollout and real-recipient proof are pending. [The readiness runbook](../release/guest-email-readiness.md) records those limits.

There is one contact per invitation, bound to the trusted home and party. Reminder enrollment requires explicit consent. A typed address needs a verification POST; its GET page only previews the action and reveals no family/stay details. The Google path derives verified identity server-side. Enrollment is bounded to three requests, resetting only after 24 hours without a request. All guest sends, including verification, are disabled for synthetic homes.

Purpose-separated HMAC capabilities under `LINK_TOKEN_SECRET` bind contact generation, invitation ID, current invitation-token fingerprint and expiry. Verification expires within 24 hours; return access within 30 days; both are capped by current invitation expiry. A return GET establishes a cookie but never reconfirms a visit. Every guest-session request resolves the capability against current consent, verified contact, generation and noncancelled/nonrevoked invitation access. Opt-out and address changes increment generation and cancel queued work; reissue/revocation invalidates the invitation fingerprint or live access.

`guest_contacts`, `guest_email_outbox` and `guest_email_attempts` are web-only tables with RLS and explicit grants denying agent, public, anon, authenticated and service-role access. Contact addresses and capabilities never enter agent tasks or memory. Before an external send, the worker takes the shared home/contact lock, checks current consent and access, and for reminders verifies the authoritative notification, visit/job cycle and prearrival date in the home's timezone. It commits an authorized receipt before SES, then records acceptance independently of later opt-out/cancellation. Withdrawal prevents subsequent authorization; it cannot recall already authorized in-flight email. Unresolved authorized sends become `unknown` and are not automatically resent. Only claims that never reached authorization can be safely reclaimed. Sanitized error names and provider message IDs are evidence of attempts, not proof of inbox delivery.

Host delivery statuses distinguish no contact, unverified/disabled contact, unavailable invitation access, ready, queued, service acceptance, failure, unknown and demo. Guest silence remains a separate visit fact. Original in-app reminders continue even when email is unavailable.

## Room inventory and guest disclosure

The public repository and synthetic demo do not define the real household layout. They do not contain real house plans, photographs, source paths, GPS data, or a real room list. A host enters real inventory later through the authenticated room ledger. Until the host supplies complete guest-facing room facts and makes the room available, it remains draft and fails closed.

Room data has separate disclosure levels:

| Audience                    | Room data                                                                                                                                     |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Host web view               | Internal and guest labels, floor and sleeping details, capacities, inventory state, overflow policy, date controls, and private notes         |
| Guest invitation            | Guest label, floor label, sleeping arrangement, capacities, overflow arrangement when relevant, and availability for that invitation's search |
| Guest visit record          | Guest-visible labels for that guest's own assigned rooms                                                                                      |
| Agent and WebMCP read tools | Bounded, non-private fields only; database-derived text is marked as untrusted                                                                |
| Calendar feed               | Guest-visible room labels and guest count only                                                                                                |

A guest does not receive hidden or unavailable rooms, internal room names, private room notes, private block notes, another party's identity, or another party's room assignment. Search results are not booking authority. Hold and reschedule transactions read the exact room IDs and availability again under the home lock before they write shared occupancy rows.

## Private household use and proposals

A private room block uses the same room and date exclusion constraint as a guest visit. Its public-safe label and private note are separate. The private note stays in the host boundary and is not copied to agent prompts, guest DTOs, WebMCP results, audit payloads, or calendar events.

The Strands coordinator can prepare a bounded room-action proposal from a host request. It cannot apply the proposal. A host-authenticated Server Action reloads the proposal, verifies its home scope and current room state, and applies it once. This keeps natural-language assistance separate from write authority.

WebMCP follows the same rule. Page tools can read bounded visible state or prepare a visible form. They do not accept home, host, invitation, or database authority in their schemas, and they do not submit a booking, block, opening, or closure. The person reviews and submits through the normal application control.

## Calendar feed capabilities

An iCalendar URL is a bearer capability. Each feed uses a different 32-byte random token. The database stores a purpose-bound HMAC under `CALENDAR_FEED_SECRET`, not the plaintext token. The host sees the subscription URL when the feed is issued and can revoke that feed independently. Unknown and revoked tokens return the same not-found response.

The feed publishes at most the 500 most recent eligible all-day events, ordered by stay before deterministic rendering, with generic summaries. It can include the guest count and guest-visible room labels. It excludes guest and host names, email addresses, invitation content, special requests, arrival details, private notes, raw proposal text, and all capability tokens. Reading the feed does not mutate application state.

Local fixtures, HTTP reads and a parser verify iCalendar generation and privacy. These checks do not subscribe a real family calendar or write to Google Calendar or iCloud. Treat any issued URL as a secret even during local testing, and revoke it after accidental disclosure.

## Host email pings

When a run pauses for a host decision or a reconfirmation escalates, the web runtime's email outbox (`dispatchHostEmailPings`, `src/core/notifications/email-outbox.ts`) creates one source row per eligible host/event and sends through Amazon SES. Only a host with a claimed email address (`host_identity_claims.normalized_email`) and `host_notification_settings.email_pings` not explicitly `false` receives one; this host outbox does not address guests; guest reminders use the separate verified-consent outbox described above. The email carries the party name, the stay dates or a generic reconfirmation notice, a reason label, and a link back to the host page — never a guest link token, calendar feed URL, or other capability. `host_email_pings` records `to_address`, `subject`, delivery `status`, and (on failure) an `error_name`; it never stores the rendered message body. Outbox source identity is unique on `(kind, source_id, host_id)`, and rows are deleted 90 days after creation by the same daily retention pass described above.

Because the AWS SES account for this project already has production access and `thecreativetoken.com` is a verified domain identity, sending is not limited to a sandbox recipient allowlist; the IAM policy in `infra/iam/web-ses-policy.json` restricts the web runtime's `layalga-web` user to the verified sender address and the two seeded host addresses regardless.

## Household memory and Forget

Returning-guest recall is stored in a single AgentCore Memory resource, `LayalgaHouseholdMemory-CBgKZc7mK4`, under one namespace per party, `/parties/home-<homeId>/party-<partyId>` (`src/agent/memory.ts`). Two extraction strategies turn raw conversational events into long-term memory records: `HouseholdPreferences` (a `userPreference` strategy over `/parties/{actorId}/preferences`) and `HouseholdFacts` (a `semantic` strategy over `/parties/{actorId}/facts`). Raw events expire automatically 30 days after they are written, at the memory resource's `eventExpiryDuration`; the long-term records the strategies extract from those events persist independently of that expiry, until a host erases them.

Host capture conversations are excluded from memory extraction because raw invitation text can name people. The deterministic `recordCaptureMemory` path omits the family-name field and writes bounded invitation facts; free-text facts can still contain personal information. Known guest prompt identity fields are omitted, and informational notes and reminder contacts are not memory input. Agent recall uses `search_memory`, with successful calls audited on the run timeline, rather than automatic prompt injection.

Guest options and the agent room-search tool also use `loadPartyRoomPreferences` to read the exact trusted party namespace directly. This path is bounded to three pages, 100 records and two seconds, and maps only supported ground-floor, upper-floor, separate-bed and double-bed preferences. It returns a bounded explanation rather than raw memory. Feasibility, standard capacity and room count precede preference ranking; manual choice and booking policy remain authoritative. Off, missing, unavailable, unusable and conflicting inputs have visible fallbacks; unavailable reads log only a sanitized marker. These direct reads do not create a `search_memory` audit event. Ground floor does not establish accessibility.

A guest task's memory store is scoped to its own party's namespace and cannot read or write another party's. A host task without a deterministically matched party reads the whole home's namespace read-only; it is never writable, so a host-side task cannot introduce a party-attributed fact into another party's record. The host page's "What L'Ayalga remembers" panel lists each party's current records by calling `ListMemoryRecords` on that party's namespace. A host's Forget action (`forgetPartyMemory`, `src/core/memory/forget.ts`) deletes every memory record under the party's namespace in batches of 100 and every raw event across every session for that party's actor id, then writes an auditable `memory_forgotten` event with actor `host` recording the deleted counts — the erasure itself is accountable, the same way every other consequential action in this system is.

The IAM policy in `infra/iam/memory-data-plane.json` scopes the eleven `bedrock-agentcore:*` data-plane actions memory read, write, and Forget need to that one memory resource ARN, attached to the web runtime's `layalga-web` user and inline on the AgentCore runtime's execution role.

## Tracing spans and CloudWatch retention

Amazon Bedrock AgentCore Runtime exports OpenTelemetry spans through ADOT for Node once `scripts/enable-transaction-search.sh` has been run once at the account level. `invoke_agent` spans carry conversation messages, `chat` spans carry the prompt sent to Bedrock, and `execute_tool` spans carry each tool call's input and result, so span content includes the same prompt and tool text described above, when such data is present, plus the `layalga.home_id`, `layalga.task`, and `session.id` identifiers `buildAgent` attaches (`src/agent/agent.ts`); known identity fields are minimized, but arbitrary invitation or request text can still identify people. Spans land in the AgentCore runtime's own CloudWatch log group, `/aws/bedrock-agentcore/runtimes/<runtime-id>-DEFAULT`, which `enable-transaction-search.sh` sets to a 14-day retention so span content does not accumulate indefinitely; that retention is independent of, and shorter than, the 30- and 180-day database retention windows above.

## Deferred channels

Telegram is not an implemented notification or booking channel. It needs an explicit account-to-person binding, consent, replay protection, and a safe way to move from a message to visible confirmation.

A remote MCP server is also not implemented. Browser WebMCP uses the authority of the page that a person already opened. A remote MCP service would need OAuth resource and audience binding, PKCE where applicable, token revocation, rate limits, and the same host or invitation checks as the web application. Direct Google Calendar or iCloud writes and two-way synchronization need a separate authorization and conflict model.
