# Current product and remaining work

Updated September 5, 2026. This is the current roadmap for the Everyday Agents completion. Dated research and earlier plans record the decisions that led here; they are not a current backlog. Implementation is distinct from production activation.

## Implemented in the completion

| Need                                           | Current behavior                                                                                                                      | Evidence route                                                                                                           |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Guests or hosts change their mind              | Explicit cancellation or pre-booking withdrawal releases rooms and retires stale work; natural language prepares review               | [Guest manual](guides/guest-manual.md), [cancellation service](../src/core/booking/cancellation.ts)                      |
| Access must last through a stay                | Finite initial access extends through at least checkout plus seven days; cancellation and revocation remain authoritative             | [Invitation lifecycle](../src/core/booking/invitations.ts)                                                               |
| Ordinary information should not interrupt      | Informational notes and arrival details are separate from persisted explicit requests                                                 | [Host manual](guides/host-manual.md)                                                                                     |
| Household rules belong to the hosts            | Validated, versioned pets/children settings serialize with booking; pending approvals recheck current policy                          | [Policy settings](../src/core/policy/settings.ts)                                                                        |
| Guests need a way back to reminders            | Optional verified contact, explicit consent, revocable return access and separate delivery evidence                                   | [Guest email readiness](release/guest-email-readiness.md)                                                                |
| Remembered preferences should affect a choice  | Current-party recall ranks feasible rooms and explains matches/fallbacks; guests choose and policy still applies                      | [Preference recall](../src/core/memory/room-preferences.ts)                                                              |
| Hosts need to see decisions and outcomes first | Decision/capture/current-visit sections precede room administration; completed capture prepares a private link automatically          | [Host manual](guides/host-manual.md)                                                                                     |
| Judges need a repeatable product journey       | Separate guided routine and exception scenarios, semantic reminder steps, household-relative defaults and bounded renewed demo access | [Judge guide](submission/judge-guide.md)                                                                                 |
| Impact claims need evidence                    | A local scripted benchmark and a separate human baseline protocol distinguish tested behavior from hoped-for savings                  | [Coordination evidence](submission/coordination-evidence.md), [participant protocol](submission/participant-protocol.md) |

## Remaining owner and operational actions

- Authorize and perform a production release of the same reviewed web/agent revision, including the applicable migrations, role checks, prepared guest SES policy and deployed verification. A `develop` merge alone does not do this. Use the [release playbook](release/e2e-pro-playbook.md) and [guest email readiness checklist](release/guest-email-readiness.md).
- Complete a real consenting recipient verification/reminder/return/opt-out proof after authorization. Provider acceptance, inbox delivery and a guest reply are different observations.
- Record and upload the public demo video, then complete the Devpost entry and required Builder ID. The owner plans recording the day before the submission deadline. The [video script](submission/video-script.md) is a draft, not an uploaded video.
- Publish the three reviewed Builder article drafts and add their public links to the entry if pursuing the optional bonus. The [official rules](https://agentsforhumans.devpost.com/rules) award 0.2 per eligible public article, up to 0.6; drafts earn no bonus.
- Run the participant protocol with willing hosts and guests. Record baseline effort, task completion and confusion before making human time-saving or adoption claims.
- Keep the submitted project accessible through the end of judging and verify the final advertised demonstration against its deployed revision. The [official schedule](https://agentsforhumans.devpost.com/rules) closes submissions September 14 at 5 p.m. Pacific and judging October 8 at 5 p.m. Pacific.

## Deliberately deferred

Per-night room packing, room photography, two-way Google/iCloud calendar writes, a remote OAuth MCP service, and messaging-channel integrations remain outside this completion. WhatsApp and Twilio remain excluded for the hackathon. These would add product and authorization scope without resolving the demonstrated booking lifecycle first.

The remaining competitive uncertainty is evidence from real people and the quality of the final presentation. The implementation strengthens a credible Everyday Agents case; it does not establish comparative superiority or a guaranteed award.
