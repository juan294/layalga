# Documentation index

Current guides describe the September 5 completion, with production rollout and human evidence identified separately. Start with the root README or canonical judge guide. Use this index when rebuilding NotebookLM artifacts; dated research and plans remain history, not current product instructions.

## For judges and readers

Start with the [judge guide](submission/judge-guide.md) for a short repository
route. The [evidence index](submission/evidence.md) pairs claims with source,
tests, operating modes, and limits. The public-site discovery index is
[`/llms.txt`](../public/llms.txt); it links to the production branch's Markdown.

| Document                                                   | What it is                                                                                                      |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| [submission/judge-guide.md](submission/judge-guide.md)     | Repository evidence and guided demo routes organized by the five judging criteria                               |
| [submission/pitch.md](submission/pitch.md)                 | The Everyday Agents product narrative, technical foundation, evidence limits and spoken close                      |
| [submission/strands-usage.md](submission/strands-usage.md) | Every Strands Agents SDK feature the project uses, with code pointers                                           |
| [submission/system-guide.md](submission/system-guide.md)   | The long-form guide: product, hackathon, architecture, AWS services, agent, host and guest journeys, operations |
| [submission/devpost.md](submission/devpost.md)             | Devpost entry draft; final publication remains an owner task                                                    |
| [submission/video-script.md](submission/video-script.md)   | Video recording script with timings; no uploaded video is implied                                               |
| [submission/posts/](submission/posts/)                     | Three builder.aws post drafts                                                                                   |
| [submission/assets/](submission/assets/)                   | The CloudWatch GenAI Observability trace screenshot                                                             |

- [Coordination evidence](submission/coordination-evidence.md) — reproducible synthetic measurements with source revision and explicit limitations.
- [Participant protocol](submission/participant-protocol.md) — planned human baseline study; no human results yet.
- [Current roadmap](roadmap.md) — implemented capabilities, pending rollout and owner actions, and accepted deferrals.

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

| Document                                                                             | What it is                                                                                    |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| [release/e2e-pro-playbook.md](release/e2e-pro-playbook.md)                           | The exact-candidate release gate: thirteen steps, nine production probes, rollback            |
| [release/runtime-database-and-identity.md](release/runtime-database-and-identity.md) | Database roles, the AgentCore identity, password rotation, quarantined-job replay             |
| [security/data-lifecycle.md](security/data-lifecycle.md)                             | Retention rules, the Bedrock prompt boundary, disclosure levels per audience, trace retention |
| [compliance/third-party-licenses.md](compliance/third-party-licenses.md)             | License inventory command                                                                     |

- [Guest email production readiness](release/guest-email-readiness.md) — prepared guest SES policy, activation steps and delivery evidence limits.

## Process history

| Document                                                                                  | What it is                                                                                          |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [research/](research/)                                                                    | Dated research briefs, starting with the hackathon assessment of 2026-08-29                         |
| [Everyday Agents product checkup](research/2026-09-05-everyday-agents-product-checkup.md) | September 5 assessment of award positioning, product gaps, judge experience, and roadmap priorities |
| [plans/README.md](plans/README.md)                                                        | Index of the dated implementation plans and their phase files                                       |

- [Agent-readable evaluation research](research/2026-09-05-agent-readable-evaluation-evidence.md) — dated rationale for the canonical evidence route; current claims live in the judge guide.
