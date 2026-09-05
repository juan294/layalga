# Judge guide: L’Ayalga

L’Ayalga is a household hospitality coordinator: routine visits proceed, explicit requests pause for people, and unanswered reconfirmation returns to the hosts. This is the canonical repository-first review route for the Everyday Agents entry.

## Start here without a deployed demo

1. Read the [pitch](pitch.md) and inspect the [architecture](../architecture/README.md).
2. Follow the source-and-test map below. Product behavior is pinned to commit `618701c9d82df72df2d5bc1b6f28f63d00febe89`, which contains completion phases 1–5.
3. Read [coordination evidence](coordination-evidence.md) for the measured local synthetic workflow and its exact revision/configuration. The [participant protocol](participant-protocol.md) defines a separate human baseline; human time saved has not been measured.
4. For runtime implementation, read [Strands usage](strands-usage.md). The [trace screenshot](assets/agentcore-trace.png) is historical production evidence from the earlier September 2026 runtime, not proof that these later features are deployed.

No AWS access, email sending or production mutation is needed to inspect this route. A local scripted run demonstrates application workflow and state transitions; it does not measure live-model interpretation quality, memory quality, inbox delivery or human effort.

## Criteria, evidence and limits

The five criteria are equally weighted under the [official rules](https://agentsforhumans.devpost.com/rules), checked 5 September 2026.

| Criterion | What to inspect | Evidence and limitation |
| --- | --- | --- |
| Technical implementation | `buildAgent`, `installPolicyHook`, durable interruption and current-state rechecks | [Policy hook source](https://github.com/juan294/layalga/blob/618701c9d82df72df2d5bc1b6f28f63d00febe89/src/agent/policy-hook.ts), [refresh regression tests](../../src/agent/policy-hook-refresh.test.ts), [Strands inventory](strands-usage.md). Historical AgentCore trace is separately dated; current local checks do not establish a new production deployment. |
| Design | Decisions-first host view; routine booking, human review, guest return and cancellation | [Guided browser regression](https://github.com/juan294/layalga/blob/618701c9d82df72df2d5bc1b6f28f63d00febe89/tests/e2e/guided-demo.spec.ts), [guest email journey](../../tests/e2e/guest-email.spec.ts), [guest manual](../guides/guest-manual.md). Synthetic desktop/mobile checks are not a user study. |
| Potential impact | A concrete shared-household coordination problem and observable work completed | [Measured protocol and results](coordination-evidence.md), [participant baseline protocol](participant-protocol.md). Automated action counts and elapsed time are not human time savings or adoption evidence. |
| Creativity and originality | Remembered preferences rank feasible rooms; social requests interrupt; cancellation retires pending work | [Room ranking source](https://github.com/juan294/layalga/blob/618701c9d82df72df2d5bc1b6f28f63d00febe89/src/core/rooms/recommendation.ts), [preference integration tests](../../src/core/booking/guest-preferences.integration.test.ts), [cancellation regressions](https://github.com/juan294/layalga/blob/618701c9d82df72df2d5bc1b6f28f63d00febe89/src/core/booking/cancellation.integration.test.ts). Supported preferences are bounded; no claim of universal novelty or accessibility assessment. |
| Presentation | One coherent routine → exception → follow-through story | [Video script](video-script.md), this walkthrough, [system guide](system-guide.md). Recording is an owner task planned for 13 September; upload URL and submission remain pending. |

## Walk through the synthetic product

Use a local target prepared through the repository's documented setup, or a deployed target whose capability revision has been verified. The [live site](https://layalga.thecreativetoken.com) may still represent the earlier production release. Do not infer that a feature is deployed merely because it is documented here.

### 1. Enter and complete a routine stay

On the sign-in screen choose **Enter as Host**. The synthetic banner and guided panel identify this household. Start **Vega**; this deliberately resets shared demo state and opens its guest journey.

Search the supplied dates with four guests. Keep both open rooms selected. A note such as “Thank you for having us” is informational and does not ask for approval. Submit and observe the completed run and confirmed stay. Return to the host view: the current outcome now shows that booking.

If memory is off, the explanation says so. With a separately verified memory-enabled target, supported remembered room preferences can affect the recommendation, and matched/unmatched details remain visible. Guests can choose another valid set. Do not seed or invoke AWS memory just to conceal a fallback during judging.

### 2. Show a successful reconfirmation

Use **Advance to next guest reminder**. The shortcut advances the synthetic household clock to the relevant persisted job. Open the guest journey and answer **Yes, we are coming**. Return to the host: the outcome becomes reconfirmed and the escalation for that cycle is no longer needed.

### 3. Start a fresh human exception

Start **Otero** from the guided host panel. This resets the previous scenario; the paths are independent. Search for the two guests and select the Garage Room. Its captured explicit request is visible separately from informational notes.

Submit. The run waits for a host and a decision appears at the top of the host view. Approve it, observe the resumed run completing, and inspect the confirmed outcome. Approval rechecks current availability and policy; it cannot force a stale or invalid booking through.

### 4. Show unanswered follow-through

For the newly confirmed Otero visit, run **Advance to next guest reminder** and leave the guest request unanswered. Then run **Advance to next host follow-up**. The host receives an unresolved follow-up outcome. Repeating either exhausted shortcut reports that no eligible work remains; it does not manufacture another notification.

Delivery configuration is visible. Local evidence uses `EMAIL=none`; synthetic guest invitations never send guest email. Do not describe this sequence as inbox delivery or a measured real-world response time.

### 5. Inspect closure and other boundaries

Open the guest cancellation review and explicitly confirm the displayed stay. Rooms are released and obsolete pending decisions, runs, jobs and delivery work are retired. An unbooked invitation instead offers withdrawal. Typing “we cannot come” prepares review; it cannot cancel without that confirmation.

For optional deeper inspection, see the host's versioned household rules, the notes/request split, room inventory and private blocks, revocable calendar feeds, and guest reminder preferences. Real reminder enrollment needs consent and verification; GET only reviews a verification, POST confirms it. Return capabilities are checked on every request, and opt-out invalidates their authority.

## Submission and evidence status

The deadline is **14 September 2026, 17:00 PDT**; judging runs through 8 October. The official video maximum is five minutes; our draft targets about three minutes. These dates and requirements come from the [official rules](https://agentsforhumans.devpost.com/rules).

Three [Builder post drafts](posts/deterministic-policy-under-strands.md) are unpublished. The rules offer 0.2 bonus points per eligible public post, up to 0.6; drafts do not earn that bonus. Recording, upload, Builder publication, AWS Builder ID/entry completion and human research remain owner actions. Production rollout, guest SES permissions and real-email verification are separately pending operational work; see [guest email readiness](../release/guest-email-readiness.md).
