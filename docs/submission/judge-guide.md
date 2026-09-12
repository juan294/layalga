# Judge guide: L’Ayalga

L’Ayalga is a household hospitality coordinator: routine visits proceed, explicit requests pause for people, and unanswered reconfirmation returns to the hosts. This is the canonical repository-first review route for the Everyday Agents entry.

## Start here

1. Read the [pitch](pitch.md) and inspect the [architecture](../architecture/README.md). The [source evidence index](evidence.md) adds detailed architectural cards and separately dated baseline verification.
2. Follow the source-and-test map below. The v1.3.7 release adds safe structured public run summaries and suppresses interrupted-run internals. Broader production evidence remains pinned to v1.3.2 commit `90b68385a590144d6d44cd7dd41298180b2d182c` until the new production gate completes.
3. Read [coordination evidence](coordination-evidence.md) for the measured local synthetic workflow and its exact revision/configuration. The [participant protocol](participant-protocol.md) defines a separate human baseline; human time saved has not been measured.
4. For runtime implementation, read [Strands usage](strands-usage.md). The [v1.3.2 protected production run](https://github.com/juan294/layalga/actions/runs/34583050263) proves the exact Vercel and AgentCore candidate through the guided demo and all nine probes. The [trace screenshot](assets/agentcore-trace.png) remains a dated visual example of CloudWatch GenAI Observability.

No AWS access, email sending or production mutation is needed to inspect this route. A local scripted run demonstrates application workflow and state transitions; it does not measure live-model interpretation quality, memory quality, inbox delivery or human effort.

## Criteria, evidence and limits

The five criteria are equally weighted under the [official rules](https://agentsforhumans.devpost.com/rules), checked 11 September 2026.

| Criterion                  | What to inspect                                                                                          | Evidence and limitation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Technical implementation   | `buildAgent`, `installPolicyHook`, durable interruption and current-state rechecks                       | [Policy hook source](https://github.com/juan294/layalga/blob/90b68385a590144d6d44cd7dd41298180b2d182c/src/agent/policy-hook.ts), [refresh regression tests](../../src/agent/policy-hook-refresh.test.ts), [Strands inventory](strands-usage.md), and [production workflow](https://github.com/juan294/layalga/actions/runs/34583050263). The run verified AgentCore, Sonnet 4.6, memory recall, host SES acceptance, concurrency, interrupt/resume, guest isolation, and cleanup; it does not prove inbox receipt or general model quality. |
| Design                     | Decisions-first host view; routine booking, human review, guest return and cancellation                  | [Guided browser regression](https://github.com/juan294/layalga/blob/90b68385a590144d6d44cd7dd41298180b2d182c/tests/e2e/guided-demo.spec.ts), [categorical computed-style regression](https://github.com/juan294/layalga/blob/90b68385a590144d6d44cd7dd41298180b2d182c/tests/e2e/run-status-styling.spec.ts), [guest email journey](../../tests/e2e/guest-email.spec.ts), and [guest manual](../guides/guest-manual.md). Synthetic desktop/mobile checks are not a user study.                                                               |
| Potential impact           | A concrete shared-household coordination problem and observable work completed                           | [Measured protocol and results](coordination-evidence.md), [participant baseline protocol](participant-protocol.md). Automated action counts and elapsed time are not human time savings or adoption evidence.                                                                                                                                                                                                                                                                                                                              |
| Creativity and originality | Remembered preferences rank feasible rooms; social requests interrupt; cancellation retires pending work | [Room ranking source](https://github.com/juan294/layalga/blob/90b68385a590144d6d44cd7dd41298180b2d182c/src/core/rooms/recommendation.ts), [preference integration tests](../../src/core/booking/guest-preferences.integration.test.ts), [cancellation regressions](https://github.com/juan294/layalga/blob/90b68385a590144d6d44cd7dd41298180b2d182c/src/core/booking/cancellation.integration.test.ts). Supported preferences are bounded; no claim of universal novelty or accessibility assessment.                                       |
| Presentation               | One coherent routine → exception → follow-through story                                                  | [Video script](video-script.md), this walkthrough, and [system guide](system-guide.md). Production is ready for recording; the public video URL and final submission remain pending.                                                                                                                                                                                                                                                                                                                                                        |

## Walk through the synthetic product

Use the [live site](https://layalga.thecreativetoken.com) for the judged demonstration. The v1.3.2 protected run reported commit `90b68385a590144d6d44cd7dd41298180b2d182c`, healthy configuration, and no stale or retrying work; v1.3.7 adds the run-result presentation fix found during rehearsal. A local target remains available for source reproduction, with its scripted-model limits stated separately.

### 1. Enter and complete a routine stay

On the sign-in screen choose **Enter as Host**. The synthetic banner and guided panel identify this household. Start **Vega**; this deliberately resets shared demo state and opens its guest journey.

Search the supplied dates with four guests. Keep both open rooms selected. A note such as “Thank you for having us” is informational and does not ask for approval. Submit and observe the completed run and confirmed stay. Return to the host view: the current outcome now shows that booking.

If memory is off, the explanation says so. With a separately verified memory-enabled target, supported remembered room preferences can affect the recommendation, and matched/unmatched details remain visible. Guests can choose another valid set. Do not seed or invoke AWS memory just to conceal a fallback during judging.

### 2. Show a successful reconfirmation

Use **Advance to next guest reminder**. The shortcut advances the synthetic household clock to the relevant persisted job. Open the guest journey and answer **Yes, we are coming**. Return to the host: the outcome becomes reconfirmed and the escalation for that cycle is no longer needed.

### 3. Start a fresh human exception

Start **Parker** from the guided host panel. This resets the previous scenario; the paths are independent. Search for the two guests and select the Garage Room. Its captured explicit request is visible separately from informational notes.

Submit. The run waits for a host and a decision appears at the top of the host view. Approve it, observe the resumed run completing, and inspect the confirmed outcome. Approval rechecks current availability and policy; it cannot force a stale or invalid booking through.

### 4. Show unanswered follow-through

For the newly confirmed Parker visit, run **Advance to next guest reminder** and leave the guest request unanswered. Then run **Advance to next host follow-up**. The host receives an unresolved follow-up outcome. Repeating either exhausted shortcut reports that no eligible work remains; it does not manufacture another notification.

Delivery configuration is visible. Local evidence uses `EMAIL=none`; synthetic guest invitations never send guest email. Do not describe this sequence as inbox delivery or a measured real-world response time.

### 5. Inspect closure and other boundaries

Open the guest cancellation review and explicitly confirm the displayed stay. Rooms are released and obsolete pending decisions, runs, jobs and delivery work are retired. An unbooked invitation instead offers withdrawal. Typing “we cannot come” prepares review; it cannot cancel without that confirmation.

For optional deeper inspection, see the host's versioned household rules, the notes/request split, room inventory and private blocks, revocable calendar feeds, and guest reminder preferences. Real reminder enrollment needs consent and verification; GET only reviews a verification, POST confirms it. Return capabilities are checked on every request, and opt-out invalidates their authority.

## Submission and evidence status

The deadline is **14 September 2026, 17:00 PDT**; judging runs through 8 October. The submission video maximum is three minutes; our script targets 2 minutes 55 seconds. These dates and requirements come from the [official rules](https://agentsforhumans.devpost.com/rules).

Three supporting articles are published on AWS Builder Center: [deterministic household policy](https://builder.aws.com/content/3JDQAfyHGB6qjJ0jAxwcnaCdRUk/agents-for-humans-deterministic-household-policy-under-a-strands-agent), [durable interrupts](https://builder.aws.com/content/3JDQsaSl4Yucs12mbJpXOyRCj5b/agents-for-humans-durable-interrupts-for-household-decisions), and [proactive follow-through](https://builder.aws.com/content/3JDR9dE9hJBcB4SItqBUl0GqL01/agents-for-humans-testing-proactive-follow-through-with-an-honest-clock). The rules offer 0.2 bonus points per eligible public post, up to 0.6. The Devpost AWS Builder ID, track, repository, architecture, live-demo, and article fields are populated. Recording, public upload, final submission, and human research remain pending. Guest SES permission and real-recipient verification remain separate operational work; see [guest email readiness](../release/guest-email-readiness.md).
