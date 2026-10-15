# Documentation index

Start with the root README, the [current roadmap](roadmap.md) and the user manuals below. Production still runs v1.3.11, the hackathon demo; the real-use launch removes demo mode and is not released yet. Use this index when rebuilding Gemini Notebook resources; include the current sources listed below and exclude dated research, plans, the hackathon archive, generated design-bundle copies, private inventory, and ignored agent reports. The public-site discovery index is [`/llms.txt`](../public/llms.txt); it links to the production branch's Markdown.

## Real-use launch

| Document                                                                                          | What it is                                                                                    |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| [Demo mode removal and Google sign-in](research/2026-10-15-demo-mode-removal-and-google-login.md) | Research: every demo surface, the Google sign-in path, and the production state on 2026-10-15 |
| [Real-use launch plan](plans/2026-10-15-real-use-launch.md)                                       | Six phases: test foundation, fixture probes, demo removal, documentation, two releases        |
| [Real-use launch notes](plans/2026-10-15-real-use-launch-notes.md)                                | Implementation deviations, review dispositions and open owner decisions                       |
| [Current roadmap](roadmap.md)                                                                     | Released capabilities, the real-use launch steps, guest-email work and accepted deferrals     |

## Hackathon archive

The [hackathon archive](archive/hackathon/README.md) keeps the AWS Agents for Humans submission: the judge guide, evidence index, pitch, Strands inventory, system guide, Devpost copy, video scripts, coordination evidence, participant protocol and the published articles. It describes the judged demo as of 2026-10-14, not current behavior.

## For hosts and guests

| Document                                         | What it is                                                                       |
| ------------------------------------------------ | -------------------------------------------------------------------------------- |
| [guides/host-manual.md](guides/host-manual.md)   | Host journey, decisions, current outcomes, household settings and administration |
| [guides/guest-manual.md](guides/guest-manual.md) | Guest journey, room choice, requests, reminders, changes and cancellation        |

## Architecture and decisions

| Document                                                                               | What it is                                                                                                                                                            |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [architecture/README.md](architecture/README.md)                                       | The diagram set: the Mermaid topology, the draw.io detailed view, and the supporting diagrams for request lifecycle, interrupt and resume, reconfirmation, and memory |
| [decisions/0001-bootstrap-scope.md](decisions/0001-bootstrap-scope.md)                 | Initial scope decision                                                                                                                                                |
| [decisions/0002-agent-runtime.md](decisions/0002-agent-runtime.md)                     | The agent runtime decision with dated addenda: the failed spike, the AgentCore proof, the production switch, tracing, memory, releases                                |
| [decisions/0002-release-gate-discipline.md](decisions/0002-release-gate-discipline.md) | How the release gate itself may change                                                                                                                                |

## Operations

| Document                                                                             | What it is                                                                                        |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| [release/e2e-pro-playbook.md](release/e2e-pro-playbook.md)                           | The exact-candidate release gate: local and production probe targets, rollback, real-use releases |
| [release/runtime-database-and-identity.md](release/runtime-database-and-identity.md) | Database roles, the AgentCore identity, password rotation, quarantined-job replay                 |
| [security/data-lifecycle.md](security/data-lifecycle.md)                             | Retention rules, the Bedrock prompt boundary, disclosure levels per audience, trace retention     |
| [compliance/third-party-licenses.md](compliance/third-party-licenses.md)             | License inventory command                                                                         |

- [Guest email production readiness](release/guest-email-readiness.md) — prepared guest SES policy, activation steps and delivery evidence limits.
- [Email template design](design/email-templates/README.md) — the shared transactional email template, its design handoff, and where each automated email is rendered.

## Process history

| Document                                                                                  | What it is                                                                                          |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [research/](research/)                                                                    | Dated research briefs, starting with the hackathon assessment of 2026-08-29                         |
| [Everyday Agents product checkup](research/2026-09-05-everyday-agents-product-checkup.md) | September 5 assessment of award positioning, product gaps, judge experience, and roadmap priorities |
| [plans/README.md](plans/README.md)                                                        | Index of the dated implementation plans and their phase files                                       |

- [Agent-readable evaluation research](research/2026-09-05-agent-readable-evaluation-evidence.md): dated rationale for the hackathon evidence route; the judge guide it describes is now in the hackathon archive.
