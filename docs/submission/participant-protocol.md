# Household coordination participant protocol

Status: prepared protocol. No participants have been recruited, sessions conducted or human time savings measured. Recruitment and running sessions remain owner work.

## Question

Can a host and guest complete a routine visit and a request requiring approval with less coordination effort, while understanding what is confirmed, who must act next and what the system cannot guarantee?

## Setup

Use synthetic households, invented names and disposable local records. Explain what will be recorded and obtain the participants’ agreement before starting. Collect task timings, counted actions and short feedback; avoid collecting real contact details, sensitive accommodation information or production invitation links. Participants may stop or skip a question. Do not send real email.

Start with a small formative set of host/guest sessions to identify usability problems. Report the actual number and participant background, including whether people already know the project. This is not a statistically powered effectiveness study, and owner/developer sessions must be labeled separately.

Prepare two matched sets of room capacities, dates and household constraints. Each set has a routine visit, a request requiring a host’s judgment, a reminder and a cancellation. Keep the constraints and task difficulty comparable across conditions. Use different synthetic families and dates so the second task is not merely a recalled answer.

## Conditions

1. **Manual baseline:** participants receive the same room inventory and household rules, a blank calendar and a simple text conversation channel. They coordinate and record the final decision themselves. Do not give this condition artificial delays or additional tasks.
2. **L’Ayalga:** participants use the normal guest and host interface. Give them the task and necessary starting access, without telling them which control to press. Reset the synthetic household explicitly before each independent scenario. Explain demo clock advancement as a testing convenience, not elapsed human time.

Alternate which condition is attempted first across sessions, and record the order. Use the same observer assistance policy in both conditions. If someone needs help, record the prompt and its time; do not silently guide one condition more heavily.

## Tasks and completion criteria

| Task           | Observable completion                                                                                    |
| -------------- | -------------------------------------------------------------------------------------------------------- |
| Routine visit  | Exact dates and rooms are agreed; the guest and host correctly identify the booking as confirmed.        |
| Access request | A host makes the decision; the guest does not interpret a floor label as proof of accessibility.         |
| Reconfirmation | The guest answers before escalation and both roles correctly understand the resulting state.             |
| No reply       | The host identifies that follow-up is needed and distinguishes no response from email delivery evidence. |
| Cancellation   | The guest explicitly cancels; the host understands that the rooms and outstanding work are released.     |

End a task at its observable completion or at a predetermined, equally applied stop time. Record incomplete and incorrect outcomes; do not discard them from the comparison. Verify application outcomes against the database after the session without exposing private data to participants.

## Record

For each task and condition, record elapsed task time, active interaction time if it can be observed consistently, messages exchanged, explicit decisions, errors, reversals, assistance and completion. Count a message or decision using the same definition in both conditions. Record app waiting time separately where possible. Keep synthetic clock jumps separate from task time.

After each task ask: “What is the current status?”, “Who needs to act next?”, “What would you do if these plans changed?” and “What felt unclear or unnecessary?” After both conditions ask which they preferred and why. Capture negative feedback and uncertainty as well as favorable comments.

## Report

Publish the actual sample, protocol deviations, task order, failures, assistance and per-task measurements. For matched observations, show both conditions and their difference; do not report a percentage improvement without the underlying values. With a small formative sample, use descriptive results and concrete usability findings rather than population claims.

Keep this human study separate from the [scripted coordination benchmark](coordination-evidence.md). A faster automated run is not evidence that people save the same time. Do not represent proposed sessions or internal developer tests as independent user validation.
