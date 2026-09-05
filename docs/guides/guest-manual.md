# Guest manual

L’Ayalga helps you arrange a stay with a household. You choose dates and rooms; household rules protect availability; a host decides when an explicit request or an overflow arrangement needs approval.

This guide describes the implementation at commit `618701c` (5 September 2026). These completion features have passed local verification; their production rollout is separate. For a reproducible synthetic visit, start with the [judge guide](../submission/judge-guide.md).

## 1. Open your invitation

Your host sends a private invitation link. You can use it without creating an account. Treat it as private: anyone holding a valid link can access that invitation. A new unbooked link normally lasts 30 days. Confirmation and rescheduling extend a valid, unrevoked invitation through checkout plus seven days when needed. Cancellation or withdrawal ends that invitation's access; an extension never revives a revoked or cancelled link.

You can also sign in with Google and use a party already claimed by your verified account. A reminder return link provides a separate, revocable guest session after its capability is validated. These routes all authorize the invitation on the server; knowing a visit identifier is insufficient.

An expired or revoked link cannot be recovered by changing the URL. Contact your host. Signing out clears account and guest-session cookies; it does not erase a private link that someone already holds.

## 2. Search and choose rooms

1. Check the party's adults, children and pets, then choose a stay or a search window.
2. Find options. Only rooms available for the whole stay are offered. Private blocks, closed rooms and rooms occupied by live holds or visits are excluded. A withheld room needs an opening covering the complete stay.
3. Review the recommended room set, sleeping arrangements and capacity. You can change the selected rooms before submitting.
4. If the party fits only with a documented overflow arrangement, explicitly accept that arrangement. A host must then approve it. A party above maximum capacity cannot proceed.

Defaults use the household's date and timezone. Synthetic homes use their labeled demo clock. Valid future invitation dates are preserved; stale or invalid dates receive a usable future default.

### Remembered preferences

When memory is enabled and usable, a previous ground-floor, upper-floor, separate-bed or double-bed preference can rank otherwise valid room combinations. The explanation identifies matched and unmatched preferences and distinguishes the recommended set from your current choice.

Missing, unavailable, conflicting or unsupported memory produces an explicit fallback. A recommendation never changes your dates, party counts, requests or consent, and never overrides availability or household rules. A ground-floor match is a room attribute, not a promise of step-free access or accessibility. Ask the host about any specific access requirement.

## 3. Information and requests are different

Use **informational notes** for details such as “Thank you for having us.” These are retained with the visit for authorized guests and hosts, but do not themselves ask a host to make a decision. The field accepts up to 1,000 characters.

Use **requests needing a host decision** for something you need the household to approve. This field accepts up to 500 characters. Requests already captured in the invitation remain visible and cannot be silently removed by editing the form. They remain attached when an interrupted booking resumes.

Notes, arrival details and explicit request prose are kept out of the assembled guest-submission model prompt. They remain trusted application data. A free-text change message is different: the agent must read it to interpret the requested change. Avoid unnecessary personal or sensitive information.

## 4. Submit and read the outcome

Submission queues a run and displays its progress. A normal request can place a temporary hold and confirm without a host decision. An explicit request or overflow arrangement pauses for approval before the relevant booking operation. An interrupted request does not necessarily have a hold yet.

- **Confirmed:** the stay and rooms are booked.
- **Waiting for a host:** a decision is needed. Refreshing or opening the same invitation preserves the result.
- **Unavailable or denied:** current capacity, availability or household rules do not allow the request. Review the explanation and change your selection.
- **Expired hold:** those rooms are no longer reserved. Use change controls if they are still offered. Otherwise contact your host for a new invitation, or cancel the old request.
- **Failed run:** follow the displayed recovery guidance. A technical failure is not an approval.

Households can configure their children-family limit and whether parties with pets may overlap. Capacity remains a hard boundary. A host's approval of a special request does not override a rule or an occupancy conflict. Availability and policy are checked again when a booking is written or resumed.

## 5. Change, cancel or withdraw

Use **Request a change** to describe new dates or another change. If your message means you cannot attend, the agent prepares a cancellation review. It cannot cancel merely because you sent that message.

The cancellation control shows the exact current stay and requires your explicit confirmation. An invitation without an active visit offers withdrawal of the request instead. If the stay changes between review and confirmation, you must review the refreshed state; stale details are not accepted.

Confirmed cancellation releases the rooms and retires associated outstanding decisions, runs, reconfirmation jobs and obsolete delivery work. Your invitation then stops granting guest access. Ask your host for a new invitation if your plans change again.

## 6. Reconfirm and choose reminders

Three days before arrival, the coordinator requests reconfirmation. Return to your invitation and choose **Yes, we are coming** or request a change. If no answer is recorded after 24 hours, the household receives a follow-up task. Delivery problems are shown separately from an unanswered request.

Real guests can optionally enable email reminders with explicit consent. Enter an address and open the verification email. Opening its link only displays a review; the verification POST requires a deliberate confirmation. For a matching claimed party, the server can use a verified Google address directly. A typed address is never treated as verified just because it was entered.

A reminder's return link opens the authorized visit, including reconfirmation, changes and cancellation. Its capability is checked on every request. Changing the address, opting out, cancellation, revocation or expiry can invalidate old links. After an address update from an email session, use the new verification guidance rather than the old session.

Use the preference panel to turn reminders off. Email delivery must be configured by the operator; the interface reports unavailable or failed delivery instead of promising an inbox message. An SES acceptance is not proof of receipt. Synthetic demo invitations do not enroll or email real guest addresses.

## 7. Privacy and help

You see your party's authorized details and guest-facing room labels, not another family's name or a room's private notes. Informational notes are retained under the [data lifecycle](../security/data-lifecycle.md), including terminal-state cleanup. Hosts can inspect and erase their household's stored party memory.

If an invitation is unavailable, a request remains unresolved, or you need an access arrangement, contact your host. The [host manual](host-manual.md) explains their controls.
