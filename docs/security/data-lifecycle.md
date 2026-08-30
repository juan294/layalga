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
| Cron execution detail                                         | 30 days                                                                                                                | Delete execution detail                                                         |

Automatic cleanup never changes running or interrupted runs. It preserves pending decisions, decisions not yet applied, decision application errors, scheduled or running jobs, and the sessions those states need. It also excludes synthetic demo homes so the fixed demonstration identities and evidence remain repeatable.

Home, host, party, invitation, visit, decision, job, and audit identity rows remain as relationship and accountability evidence. They are removed only through an explicit household deletion request or the existing cascading home deletion path. Guest capability access still expires after 30 days and can be revoked immediately by setting `link_token_revoked_at` or cancelling its invitation.

The retention function is in the unexposed `private` schema. The web and agent roles cannot execute it directly. PostgreSQL Cron runs it through the database maintenance boundary.

## Durable execution metadata

An accepted agent request creates a `runs` row before execution. Queued and running rows retain the minimum task envelope, lease, attempt count, and idempotency key needed for recovery. Terminal prompt and session data follows the retention rules above. Audit metadata remains so an operator can explain the outcome without retaining private message text.

Invitation URLs are capabilities. The database stores an invitation-scoped HMAC, not a reusable plaintext token. Reissuing a link invalidates the prior capability. Claiming an invitation to an authenticated guest account adds a durable identity relationship but does not copy the link token into account data.
