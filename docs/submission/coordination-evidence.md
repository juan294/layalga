# Synthetic coordination evidence

The coordination benchmark measures a local browser automation run through L’Ayalga’s real forms and database state. It does not measure human effort, production model quality, inbox delivery or adoption. The [measured JSON artifact](coordination-benchmark.json) records a successful September 5 run at source revision `54eab0860de93ae9d9289f228a4c6f38f24d8194`.

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

After setting the explicit local environment described in the [release playbook](../release/e2e-pro-playbook.md), keeping APP_URL at an unused local port, and committing reviewed source, run:

```bash
pnpm run benchmark:coordination -- --output docs/submission/coordination-benchmark.json
```

The recorded run used `APP_URL=http://127.0.0.1:3008`, local Supabase ports 54621/54622 and the disabled external-service modes recorded in JSON. The separate release driver retains its existing acceptance contract; a benchmark result does not replace release checks.

Do not convert this run into “minutes saved,” a reduction in real household messages, or an award score. Those claims require a measured human baseline. The [participant protocol](participant-protocol.md) describes how to collect that evidence without confusing scripted latency with human effort. Production guest email activation and real recipient testing remain separate, authorized work described in the [readiness checklist](../release/guest-email-readiness.md).

## Measured result

This single run completed all 30 named scripted actions with zero failures in **29.85 seconds** automation wall time. Server/browser startup was separately **3.04 seconds**. These values depend on the local machine and compilation/cache state; no production latency or human-speed claim follows.

| Category            |                    Executed operations |
| ------------------- | -------------------------------------: |
| Demo setup/reset    |                                      4 |
| Navigation          |                                      8 |
| Form interaction    |                                      7 |
| Simulated decisions | 6 (1 host approval, 5 guest decisions) |
| Synthetic clock     |      5 (3 advances, 2 no-work repeats) |

The cancellation round moved from two occupied rooms and one outstanding reminder job to zero occupancy, zero outstanding jobs, zero pending decisions and zero unfinished runs, with invitation cancellation/revocation verified. The separate reconfirmation round produced one in-app guest chase, then a reconfirmed visit with zero outstanding jobs. The exception round paused for one host decision, resumed after approval, produced one guest chase and exactly two host escalation notifications, and ended with one unresolved guest follow-up. Repeating the exhausted escalation added no notification or job.

The exception checkpoint retains the original interrupted run record after its separate resume run completes; `unfinishedRuns` counts that historical interrupted row and must not be read as an additional pending host decision. The authoritative pending-decision count is zero after approval. No host email send or guest provider acceptance occurred. Synthetic date jumps are recorded separately per independent round in `clockSteps`.
