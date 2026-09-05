# Synthetic coordination evidence

The coordination benchmark measures a local browser automation run through L’Ayalga’s real forms and database state. It does not measure human effort, production model quality, inbox delivery or adoption. The measured artifact is pending the first run of the reviewed, committed benchmark source; no numeric outcome is claimed here yet.

## What the run covers

Two routine rounds each start from an explicitly reset synthetic household. Vega’s two adults and two children choose the two open rooms and submit. In the first round, they cancel a confirmed booking while a real reminder job is still outstanding. Database checkpoints verify released occupancy, retired work and revoked invitation access. A fresh Vega round then exercises the reminder and guest reconfirmation, independently of cancellation.

A fresh reset starts the independent Otero scenario. Two adults and a dog request the ground-floor Garage Room with a captured access need. A host reviews the actual pending decision before confirmation. The semantic clock triggers the next reminder and then an unanswered escalation; repeated controls must report no eligible work. A ground-floor label establishes no accessibility guarantee.

All three rounds use the existing public demo entry, guest forms, host decision controls and clock API. The benchmark does not manufacture a successful visit, decision or notification. It reads persisted outcomes after the corresponding browser action.

## Measurement definitions

| Field                | Meaning                                                                                                                                                                           |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Automation wall time | Elapsed monotonic time for the measured scenario, including browser/server waits and checkpoint reads. Server startup is reported separately.                                     |
| Action duration      | Time from invoking one named browser operation until its specified completion condition. Includes automation, application and network waiting; it is not a person’s working time. |
| Interaction          | A scripted search or room-selection operation.                                                                                                                                    |
| Decision             | An explicit simulated guest submission, reconfirmation or cancellation confirmation, or host approval. The script performs these actions; no person is observed.                  |
| Navigation/setup     | Page changes, demo entry and shared demo resets, counted separately from decisions.                                                                                               |
| Demo clock           | A control that advances synthetic household time to an eligible saved job. Its browser duration is measured; the simulated date jump is recorded separately.                      |
| Checkpoint           | A sanitized database snapshot for the intended synthetic invitation, including visit/job/decision/occupancy counts and outcomes.                                                  |
| Failure              | A named operation or assertion that did not complete successfully. A failed attempt must not be reported as a successful workflow.                                                |

The JSON artifact records the source revision, controlled local configuration, timestamp, actions, aggregate counts and checkpoints. It excludes invitation capabilities, cookies, database credentials, raw requests, email addresses and private room notes. Resetting between scenarios is explicit because both scenarios share the synthetic household.

## Running and interpreting it

The runner is [scripts/benchmark-coordination.ts](../../scripts/benchmark-coordination.ts). It requires explicit scripted/local execution, disabled email/memory/external scheduling, and loopback application, database and Supabase URLs. It starts its own local application process, verifies the served revision and health, and blocks browser requests or redirects outside the allowed local origins. Run it only against the disposable local demo database, after committing the reviewed source and stopping other Next development servers in the checkout.

The root verification process will add the exact command, committed revision and resulting artifact after the first measured run. The separate release driver retains its existing acceptance contract; a benchmark result does not replace release checks.

Do not convert this run into “minutes saved,” a reduction in real household messages, or an award score. Those claims require a measured human baseline. The [participant protocol](participant-protocol.md) describes how to collect that evidence without confusing scripted latency with human effort. Production guest email activation and real recipient testing remain separate, authorized work described in the [readiness checklist](../release/guest-email-readiness.md).
