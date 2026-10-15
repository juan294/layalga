# Host manual

L’Ayalga coordinates invitations, rooms and follow-up for a household with more than one host. Routine stays can complete without a decision; explicit requests and overflow arrangements come back to a person.

This guide describes L’Ayalga for real household use. The live site runs it since v2.0.0 (2026-10-15).

## 1. Sign in with Google

Open the sign-in page and choose **Continue with Google**. Google is the only way to sign in. The household keeps a list of host email addresses; your Google account must use one of them. The first time you sign in, the server binds your Google account to your host record. After that, only that Google account can sign in as you.

If you see "This Google account is not on the host list for this house.", the account you chose is not on the list. You are signed out. Try again with the address the household recorded for you, or ask another host to add your address (see the next section). If you see "Google sign-in could not be completed", try again; if it continues, report it to the operator.

The server finds your household from your host record. Changing a home identifier in a request does not grant access to another household.

### Add a second host

There is no sign-up page. An operator adds a host through the administrative database connection:

1. If the person does not have a host record yet, add a `hosts` row for the household, with a display name that is unique in the household and a locale of `en` or `es`.
2. Add a `host_identity_claims` row that maps the person's Google email, in lower case without spaces, to that host. The [runtime database and identity runbook](../release/runtime-database-and-identity.md#provision-one-host-identity) contains the exact SQL.
3. The person signs in with Google. Their first sign-in binds the account to the host record.

The household already has two host records, Juan González and Jordan Lynn, each with a claim row. A host whose claim exists but who has not signed in yet only needs to sign in. Host email pings go only to the two host addresses that the SES IAM policy (`infra/iam/web-ses-policy.json`) allows. A new host address needs a separately authorized IAM change before it can receive pings.

### An empty household

After the real-use conversion, the household has hosts but no rooms, guests or invitations. The dashboard still opens, and the room ledger shows an empty inventory with **Add a room**. Add the rooms first (see section 5): guests cannot find options until at least one room is complete and available.

## 2. Dashboard order

The dashboard puts actionable coordination first: pending decisions, invitation capture, current visit outcomes and delivery status. Room administration, calendar subscriptions, household settings, memory and the household record remain available further down the page.

Current outcomes distinguish held, confirmed, awaiting reconfirmation, reconfirmed and escalated visits, with the next relevant action. An unanswered request remains unresolved even if its planned arrival has passed. Cancelled visits leave this active list. The calendar is useful context; the decision and outcome cards tell you what requires attention.

## 3. Capture an invitation and send its link

Paste the invitation message, check the language, and capture it. The agent structures the party, counts, dates and explicit requests. The embedded progress view follows that exact run. Once it completes successfully, the page automatically prepares the private link through an authorized server action.

Copying and sending the link are still your deliberate actions. If secure preparation fails, the page offers a retry. Reloading or duplicate completion renders must not repeatedly prepare it. Tokens are delivered outside the model transcript and are not exposed through the run-status API.

A new unbooked invitation normally lasts 30 days. Confirming or rescheduling extends a valid, unrevoked invitation through checkout plus seven days where needed. Revoked or cancelled invitations are never revived by this extension.

Raw invitation text may contain personal information and is processed by the model. Avoid unnecessary sensitive details. Host capture conversations are excluded from automatic memory extraction; a separate bounded capture event omits the family-name field. Its arrival and request facts can still contain personal information.

## 4. Routine stays and decisions

Guests search exact rooms and confirm their selection. A normal selection within capacity and household rules can complete without host intervention.

Informational notes, including thanks, are visible to authorized hosts and guests but do not request approval. Explicit requests needing a host decision are separate. Captured requests are preserved in the trusted booking draft and survive an interrupted run and resumption.

A decision card explains the request or overflow arrangement, stay, party and selected rooms. Approve or decline it, optionally adding a note. Approval resumes the paused tool only after reloading the current booking and policy. Changed capacity, room arrangement or policy can prevent application; a saved approval is not a guarantee of a completed booking. If application fails, use the displayed retry or recovery action.

An interrupted request does not necessarily hold rooms: the interruption can occur before a hold exists. A live hold lasts 48 hours. Expired holds release availability.

## 5. Household rules and rooms

Household settings configure the maximum simultaneous families with children and whether parties with pets may overlap. Updates are authorized, versioned and serialized with booking operations. A household starts with one family with children at a time and does not allow parties with pets to overlap. Change these settings to match your household.

Capacity is always enforced. A request that only fits a documented overflow arrangement requires guest consent and host approval. An above-maximum request is denied. Approving a social request cannot override room occupancy or a household rule.

The room ledger supports guest labels, sleeping arrangements, standard and maximum capacity, inventory state, overflow arrangements and private notes. Draft or incomplete rooms are not offered. A withheld room needs a date opening covering the full requested stay. Private use and guest stays share a database occupancy constraint.

To add a room, open the room ledger (`/en/rooms` or `/es/rooms`) and open **Add a room**. Enter an internal name for the hosts, a guest label, the floor, the sleeping arrangement, the standard and maximum capacity, the inventory state and, if needed, an overflow arrangement and private notes. Then choose **Create room**. A room in the `draft` state, or a room with incomplete guest-facing facts, is never offered to guests. Set the state to `available` when the room is ready, or to `withheld` when guests may use it only on dates you open. Guest-facing labels should not contain private household information.

You can enter a private block or date control directly, or ask the agent to prepare one. An agent proposal does nothing until you explicitly apply it.

## 6. Cancel a stay or withdraw a request

Use the cancellation control to review the exact stay before confirming. For an active invitation without a current visit, withdraw the request. A stale review must be refreshed if the visit changes before confirmation.

Cancellation releases occupancy and retires related pending decisions, agent runs, scheduled follow-up and obsolete queued delivery. Do not decline an old decision as a substitute for cancellation. Guests also have explicit cancellation and withdrawal controls; a natural-language cancellation request prepares review and cannot commit the cancellation itself.

## 7. Follow-through and delivery

Confirmation schedules reconfirmation for 09:00 household time three days before arrival, or immediately when already inside that window. A chase opens a reconfirmation request; an unanswered request can escalate after 24 hours. A guest answer cancels the current escalation. Cancellation and rescheduling suppress obsolete work from the old state or cycle.

Host email pings cover pending decisions and reconfirmation escalations when configured and enabled for the host. Real guests can independently consent to verified email reminders and opt out. Guest contacts and their delivery records are web-only data, outside the agent database role and model prompt.

Read delivery state separately from guest response. A failure to send is not evidence of silence. SES acceptance is not proof of inbox delivery; an uncertain provider outcome is retained without blindly retrying and risking a duplicate. See [guest email readiness](../release/guest-email-readiness.md) before any production activation.

## 8. Remembered room preferences

When available, scoped memory can rank valid room combinations using supported ground-floor, upper-floor, separate-bed or double-bed preferences. Guests see what matched, what did not, and whether their manual selection differs from the recommendation. Missing, unsupported, conflicting or unavailable recall falls back honestly.

Memory does not change party counts, dates, explicit requests, consent or household rules. A ground-floor label is not an accessibility certification. Inspect stored party memory and use **Forget this family** when appropriate.

## 9. Calendar subscriptions

Create a labeled feed, copy its bearer URL once, and subscribe in a calendar application. Keep the URL private and revoke it if exposed. Events use generic stay/private-use summaries, counts and guest-facing room labels; they omit names and notes. Stable identifiers and cancellation tombstones support removal of cancelled events.

Feeds are read-only. Refresh timing belongs to the subscribing application. Calendar edits do not write back into L’Ayalga.

## 10. Recovery

For technical failures, use the displayed retry and operator guidance in the [runtime runbook](../release/runtime-database-and-identity.md). Do not assume that a failed run booked a stay, or that an email reached its recipient.
