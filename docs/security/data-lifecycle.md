# Data lifecycle

L’Ayalga keeps booking state in PostgreSQL and sends task prompts to Amazon Bedrock only when the non-scripted model is active. The scripted demo and test model stays in process. Before a Bedrock call, the application removes host display names and party family names from known task prompt shapes. It also removes guest arrival and note text from the hold prompt because validated application state, not model text, supplies those booking values. Invitation capture and change requests retain the minimum free text needed to perform the requested task. The application does not send private guest-link tokens to the model.

This boundary does not claim that the model provider stores nothing. AWS account settings, service logging, and provider terms remain an operator responsibility. The application stores its own Strands session snapshots in `agent_sessions` and applies the policy below.

## Automatic policy

Supabase Cron calls `private.apply_data_retention()` daily at 03:17 UTC.

| Data                                                          | Boundary                                                                                                               | Action                                                                          |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Completed or failed run payload and result                    | 30 days after completion                                                                                               | Replace payload with `{}` and remove result                                     |
| Terminal agent session snapshots                              | 30 days after the last write                                                                                           | Delete snapshot                                                                 |
| Converted or cancelled invitation message and structure       | 180 days after capture, when no active visit, open job, pending decision, or failed decision application depends on it | Replace text with an empty string and structure with `{}`                       |
| Special requests on cancelled or completed reconfirmed visits | 180 days after the stay ends, when no open job or unresolved decision depends on it                                    | Remove special requests                                                         |
| Notification bodies                                           | 180 days, when no open scheduled job depends on the notification                                                       | Replace both language bodies with expiry markers                                |
| Audit payload detail                                          | 365 days                                                                                                               | Replace payload with `{}`; retain actor, kind, time, home, and run relationship |
| Host email ping rows                                          | 90 days after creation                                                                                                 | Delete the row                                                                  |
| Cron execution detail                                         | 30 days                                                                                                                | Delete execution detail                                                         |

Automatic cleanup never changes running or interrupted runs. It preserves pending decisions, decisions not yet applied, decision application errors, scheduled or running jobs, and the sessions those states need. It also excludes synthetic demo homes so the fixed demonstration identities and evidence remain repeatable.

Home, host, party, invitation, visit, decision, job, and audit identity rows remain as relationship and accountability evidence. They are removed only through an explicit household deletion request or the existing cascading home deletion path. Guest capability access still expires after 30 days and can be revoked immediately by setting `link_token_revoked_at` or cancelling its invitation.

The retention function is in the unexposed `private` schema. The web and agent roles cannot execute it directly. PostgreSQL Cron runs it through the database maintenance boundary.

## Durable execution metadata

An accepted agent request creates a `runs` row before execution. Queued and running rows retain the minimum task envelope, lease, attempt count, and idempotency key needed for recovery. Terminal prompt and session data follows the retention rules above. Audit metadata remains so an operator can explain the outcome without retaining private message text.

Invitation URLs are capabilities. The database stores an invitation-scoped HMAC, not a reusable plaintext token. Reissuing a link invalidates the prior capability. Claiming an invitation to an authenticated guest account adds a durable identity relationship but does not copy the link token into account data.

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

Phase 6 verifies iCalendar generation and privacy with local fixtures, HTTP reads, and a local parser. It does not subscribe a real family calendar or write to Google Calendar or iCloud. Treat any issued URL as a secret even during local testing, and revoke it after accidental disclosure.

## Host email pings

When a run pauses for a host decision or a reconfirmation escalates, the web runtime's email outbox (`dispatchHostEmailPings`, `src/core/notifications/email-outbox.ts`) sends at most one email per host per event through Amazon SES. Only a host with a claimed email address (`host_identity_claims.normalized_email`) and `host_notification_settings.email_pings` not explicitly `false` receives one; a guest is never a recipient, because the query joins `public.hosts` and never a party. The email carries the party name, the stay dates or a generic reconfirmation notice, a reason label, and a link back to the host page — never a guest link token, calendar feed URL, or other capability. `host_email_pings` records `to_address`, `subject`, delivery `status`, and (on failure) an `error_name`; it never stores the rendered message body. Delivery is idempotent on `(kind, source_id, host_id)`, and rows are deleted 90 days after creation by the same daily retention pass described above.

Because the AWS SES account for this project already has production access and `thecreativetoken.com` is a verified domain identity, sending is not limited to a sandbox recipient allowlist; the IAM policy in `infra/iam/web-ses-policy.json` restricts the web runtime's `layalga-web` user to the verified sender address and the two seeded host addresses regardless.

## Tracing spans and CloudWatch retention

Amazon Bedrock AgentCore Runtime exports OpenTelemetry spans through ADOT for Node once `scripts/enable-transaction-search.sh` has been run once at the account level. `invoke_agent` spans carry conversation messages, `chat` spans carry the prompt sent to Bedrock, and `execute_tool` spans carry each tool call's input and result, so span content includes the same prompt and tool text described above, for synthetic guests only, plus the `layalga.home_id`, `layalga.task`, and `session.id` identifiers `buildAgent` attaches (`src/agent/agent.ts`); it never includes host or guest names, because prompt minimization already strips them before the model call. Spans land in the AgentCore runtime's own CloudWatch log group, `/aws/bedrock-agentcore/runtimes/<runtime-id>-DEFAULT`, which `enable-transaction-search.sh` sets to a 14-day retention so span content does not accumulate indefinitely; that retention is independent of, and shorter than, the 30- and 180-day database retention windows above.

## Deferred channels

Telegram is not an implemented notification or booking channel. It needs an explicit account-to-person binding, consent, replay protection, and a safe way to move from a message to visible confirmation.

A remote MCP server is also not implemented. Browser WebMCP uses the authority of the page that a person already opened. A remote MCP service would need OAuth resource and audience binding, PKCE where applicable, token revocation, rate limits, and the same host or invitation checks as the web application. Direct Google Calendar or iCloud writes and two-way synchronization need a separate authorization and conflict model.
