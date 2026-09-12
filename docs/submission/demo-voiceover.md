# L’Ayalga demo voiceover

This narration follows the recorded English demo from the host dashboard through
routine coordination, human review, follow-up, and cancellation. Read at a calm,
conversational pace. Let the important result screens breathe instead of filling
every second with speech.

## Edit before recording the voiceover

- Remove the initial ten-second countdown.
- Remove the first failed Parker reset attempt. Cut directly from the reconfirmed
  Vega host view to the successful Parker guest screen.
- After the host approves the Parker request, remove the temporary guest form and
  loading interval. Cut from **Approve** to the host view where the Parker visit is
  confirmed.
- Remove the first failed host follow-up attempt and the inactive wait. Keep the
  successful transition to September 17 and the host message that the guest has
  not replied.
- Do not add the architecture diagram. It is too dense for this short demo.
- Finish on the clean host dashboard with no upcoming visits.

## Voiceover

### Host dashboard and the routine Vega visit

L’Ayalga coordinates guest visits for a shared family home. Invitations may come
through different hosts, but rooms, rules, requests, and follow-up need one
consistent answer.

We begin with a routine visit for the Vega family. The guest searches the proposed
dates for two adults and two children. L’Ayalga checks current availability and
offers the two rooms that fit the group. Memory can rank valid choices, but here
there is no verified room preference, so the product says that plainly.

The guest keeps both rooms and adds a thank-you. Since it does not require a host
decision, it remains information and creates no approval task.

The request runs on Amazon Bedrock AgentCore. Its timeline shows memory recall,
availability, deterministic policy checks, a temporary hold, and confirmation.
PostgreSQL remains authoritative for the booking.

Back in the host view, the stay is confirmed. We advance the labeled demo clock to
the next reminder. The guest confirms that the family is still coming, and the
ledger records the visit as reconfirmed.

### The Parker request and human review

Next, we reset the shared demo for the Parker family. Two adults and a dog request
the ground-floor Garage Room. Their invitation includes a wheelchair-related
request. Ground floor alone does not prove accessibility, so the system does not
make that judgment by itself.

When the guest submits, a Strands policy hook checks capacity, occupancy, and
household rules. It interrupts the durable run and waits for a host. The host sees
the exact dates, party, and request that need review.

Approval resumes the same persisted execution and checks current state again
before confirming the stay. An old approval cannot force a new room conflict or
invalid policy through.

### Follow-up and cancellation

We advance to the Parker reminder, but this guest does not answer. After the
configured interval, L’Ayalga returns the unresolved follow-up to the hosts.
Delivery remains separate from response, so a sending problem is never reported as
guest silence.

Finally, the guest reviews the exact stay and explicitly confirms cancellation.
The rooms are released, and obsolete reminders, decisions, and pending work lose
authority.

The final host view has no upcoming visit and no pending decision. L’Ayalga handles
routine coordination, brings exceptions to people, and follows through until the
household record is clear.
