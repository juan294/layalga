# Documentation index

One line per document. Start with the README at the repository root for the product overview and setup.

## For judges and readers

| Document                                                   | What it is                                                                                                      |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| [submission/judge-guide.md](submission/judge-guide.md)     | A ten-minute path through the live site, organized by the five judging criteria                                 |
| [submission/pitch.md](submission/pitch.md)                 | The Everyday Agents track pitch, with thirty-second, sixty-second, and two-minute versions                      |
| [submission/strands-usage.md](submission/strands-usage.md) | Every Strands Agents SDK feature the project uses, with code pointers                                           |
| [submission/system-guide.md](submission/system-guide.md)   | The long-form guide: product, hackathon, architecture, AWS services, agent, host and guest journeys, operations |
| [submission/devpost.md](submission/devpost.md)             | The Devpost entry text                                                                                          |
| [submission/video-script.md](submission/video-script.md)   | The three-minute demo script with timings                                                                       |
| [submission/posts/](submission/posts/)                     | Three builder.aws post drafts                                                                                   |
| [submission/assets/](submission/assets/)                   | The CloudWatch GenAI Observability trace screenshot                                                             |

## For hosts and guests

| Document                                         | What it is                                                                                    |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| [guides/host-manual.md](guides/host-manual.md)   | How the two hosts use the site, with sixteen what-happens-when scenarios. No technical detail |
| [guides/guest-manual.md](guides/guest-manual.md) | What an invited family does with their link, with twelve situations. No technical detail      |

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

## Process history

| Document                           | What it is                                                                  |
| ---------------------------------- | --------------------------------------------------------------------------- |
| [research/](research/)             | Dated research briefs, starting with the hackathon assessment of 2026-08-29 |
| [plans/README.md](plans/README.md) | Index of the dated implementation plans and their phase files               |
