# L’Ayalga demo voiceover

This narration follows the current English Work demo from the welcoming sign-in page through routine coordination, calendar and room visibility, human review, follow-up, and cancellation. Read at a calm conversational pace and leave important result screens visible long enough to be understood.

## Edit before recording the voiceover

- Remove the initial ten-second countdown.
- Accelerate pointer travel and inactive loading intervals, but keep forms, decisions, completed results, the calendar booking, and the final host state at normal speed.
- Keep the conversation and browser visible together. Do not add the architecture diagram or a separate GitHub or AWS Console cutaway.
- Finish on the clean host dashboard with no upcoming visits and no pending decisions.

## Voiceover

### Welcome and the routine Vega visit

L’Ayalga coordinates visits to a shared family home. Different hosts may invite guests, but rooms, household rules, requests, and follow-up still need one consistent record.

We begin with the Vega family. The guest searches the proposed three-night stay for two adults and two children. L’Ayalga checks current availability and offers the two rooms that fit the group. AgentCore Memory can rank valid choices when verified preferences exist. Here, it finds no verified room preference, and the product says so plainly.

The guest keeps both rooms and adds a thank-you as an informational note. Amazon Bedrock AgentCore runs the durable workflow, Amazon Bedrock provides the reasoning model, and deterministic policy checks the booking facts. The timeline shows memory recall, availability, policy evaluation, a temporary hold, and confirmation. PostgreSQL remains authoritative for the final booking.

### Calendar, rooms, and proactive follow-up

Back in the host view, the Vega stay is confirmed from September 18 through checkout on September 21. The visit calendar shows that booking on the household record. Its private calendar feeds are read-only and revocable, and their generic event text excludes guest names, requests, private notes, and access tokens.

The room ledger shows each room’s capacity and current door state, giving hosts the same room facts used during booking. L’Ayalga then continues beyond confirmation. The demo clock advances to the next persisted reminder, the guest confirms that the family is still coming, and the ledger records the visit as reconfirmed. Amazon SES is the production notification channel, while this synthetic guest reminder stays inside the demo.

### The Parker request and human review

The Parker scenario begins from a clean synthetic household. Two adults and a dog request the ground-floor Garage Room, and the invitation includes a wheelchair-related request. Ground floor alone does not establish accessibility, so the system does not make that judgment by itself.

A Strands policy hook checks capacity, occupancy, room selection, and household rules. It interrupts the durable AgentCore run and presents the complete request to a host. The host approves once, and AgentCore resumes the same persisted execution. Before confirming, the application checks current state again, so an old approval cannot force a new conflict or invalid policy through.

### Unanswered follow-up and clear closure

The Parker reminder is delivered, but the guest does not answer. After the configured interval, L’Ayalga returns the unresolved follow-up to both hosts. Delivery status remains separate from response, so a sending problem is never presented as guest silence.

Finally, the guest reviews the exact stay and explicitly confirms cancellation. The rooms are released, and obsolete reminders, decisions, and prior agent work lose authority.

The final host view has no upcoming visits and no pending decisions. L’Ayalga handles routine coordination, brings exceptions to people, and follows through until the household record is clear.
