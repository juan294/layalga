# Assessment: L’Ayalga’s chances in the Agents for Humans project gallery

Date: 2026-09-22 (gallery opened; judging runs 15 September to 8 October, winners 14 October)

Sources:

- <https://agentsforhumans.devpost.com/project-gallery> and the `/submissions/search` track filter, every page fetched with curl on 2026-09-22
- Every public project page linked from the gallery (1,049 pages), parsed for video, links, description text, tags and team size
- <https://agentsforhumans.devpost.com/rules> and the hackathon front page, fetched 2026-09-22
- GitHub repository metadata for the leading rivals through `gh api`
- Spoken Letter competition documents in the sibling repository: `docs/xprize/competitive-analysis-2026-08-22.md`, `docs/xprize/competitive-analysis-2026-09-08-top-100.md`, `docs/hackathon/devpost-submission.md`, `docs/hackathon/judge-welcome-package.md`, `docs/agents/xprize-contender-watch-report.md`
- Data snapshot: [2026-09-22-agents-for-humans-gallery-snapshot.json](2026-09-22-agents-for-humans-gallery-snapshot.json)

Evidence labels: VERIFIED = fetched or read in this session and cited. INFERRED = judgment built on that evidence.

## Verdict

INFERRED. L’Ayalga is a credible top-tier Everyday Agents entry. Stage One (baseline viability) is close to certain. A track prize is a plausible but not favoured outcome: roughly 30 to 40 percent for one of the three Everyday prizes and 5 to 10 percent for the Grand Prize, after crediting the Builder Center bonus described below. Without the bonus the same read gives 15 to 25 percent and under 5 percent.

The two swing factors are which criteria the individual judge weighs hardest, and whether the 0.6 bonus is applied as written.

## Rules that shape the outcome (VERIFIED)

- Two-stage judging: Stage One is a pass/fail viability check; Stage Two scores all passing entries on five equally weighted criteria: Technical Implementation (how thoroughly and skillfully the project uses Strands Agents), Design (a complete, coherent product experience), Potential Impact (a credible, specific case for a real audience), Creativity & Originality (a non-obvious use of Strands Agents), and Presentation (the video demonstrates the project end-to-end).
- Final scores run from 1 to 5.6. Up to 0.6 is added for up to three builder.aws posts, 0.2 each, published before the deadline.
- No public vote or community award exists in the rules. Gallery likes do not count.
- Judges are eleven AWS employees listed on the front page (applied scientists, developer advocates, solution architects, an SDE).
- The Everyday Agents brief: an agent that takes the busywork out of daily life and “only pings you when there’s a real decision to make”. AgentCore deployment and a live demo strengthen the technical score.

## The field (VERIFIED)

| Signal                                         | All tracks           | Everyday Agents  | L’Ayalga                 |
| ---------------------------------------------- | -------------------- | ---------------- | ------------------------ |
| Submissions                                    | 1,049                | 328              | in track                 |
| Professional / Good Neighbor                   | 509 / 212            |                  |                          |
| Video embedded                                 | 100%                 | 99%              | yes                      |
| Repository link                                | 82%                  | 82%              | yes                      |
| Live link                                      | 49%                  | 46%              | yes                      |
| Video, repo, live link and AgentCore mentioned | 22%                  | 19% (63 entries) | yes                      |
| Mentions memory                                | 26%                  | 28%              | yes                      |
| Mentions interrupts                            | 19%                  | 22%              | yes                      |
| Uses the word “deterministic”                  | 56%                  | 49%              | yes                      |
| Description length                             | median 789 words     | median 713 words | 1,282 words, 47th of 328 |
| Team of one                                    | 79%                  |                  | yes                      |
| Likes                                          | median 0; maximum 11 | maximum 9        | 2                        |

Keyword flags are substring matches on the public description, so they measure what an entry says about itself, not what its code does.

The important finding is that “run quietly, interrupt only for real decisions, policy enforced in code, honest about limits” is not a differentiator. The track brief asks for it and about half of the track claims it. What is unique to L’Ayalga in the track is the domain: nothing else coordinates guests in a shared home. HostelOps and Smart Visitor Management System are commercial operations tools, not household hospitality.

## Builder Center bonus (VERIFIED counts, lower bound)

Builder links visible on public project pages:

| Visible posts | All tracks (1,049) | Everyday (328) |
| ------------- | ------------------ | -------------- |
| none          | 1,005              | 316            |
| one           | 27                 | 10             |
| two           | 2                  | 1              |
| three         | 15                 | 1 (Kinship)    |

This undercounts because Devpost’s article fields are judge-only and some entries mention posts only in prose. L’Ayalga shows zero in its try-it links and three in its description, so its own row would read as zero under a stricter parser. Treat the table as a floor.

INFERRED. A 0.6 bonus equals scoring one full point higher on three of the five criteria. Among the rivals below, Shoulder and Minutes show one post each and the rest show none, so L’Ayalga carries a net edge of 0.4 over Shoulder and 0.6 over most of the serious field if the bonus is applied as written. The rules tie the bonus to Stage Two and require the posts to cover the AWS implementation journey, so a judge may verify rather than count them. The bonus does not repair the Impact framing.

## Rivals in the Everyday track (VERIFIED facts, INFERRED ranking)

Ranked from public pages, repositories and video metadata. Repository figures are from `gh api` on 2026-09-22.

| Entry       | Concept                                                                                    | Notes                                                                                                                                                                              |
| ----------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shoulder    | Fair sharing of an ageing parent’s care between siblings                                   | 3 people, most liked in the track (9), one Builder post, 3:02 video. Strongest narrative in the track. Repo 30 commits, created 9 September; live host on a bare sslip.io address. |
| FolderHome  | Local-first household documents with plan-then-confirm                                     | Repo created 22 August, 209 commits, claims 2,045 passing tests and AgentCore Runtime verified live. Closest to L’Ayalga in rigor.                                                 |
| Open Loops  | Inbox responsibilities ledger                                                              | 4 people, built in four days by their own account; repo still receiving pushes on 22 September, after the deadline.                                                                |
| Quiet Hours | Household admin autopilot on AgentCore with Memory, EventBridge, Slack                     | The archetype the brief describes; no repository link on the page.                                                                                                                 |
| Kith        | Authority ledger deciding who may act for whom, six-agent Strands Graph                    | Repo created and finished on 14 September, 57 commits.                                                                                                                             |
| StepSpotter | Home-repair steps gated by photo evidence via a BeforeToolCall hook                        | Published eval that keeps its own miss in view; 64 commits.                                                                                                                        |
| Day Thirty  | California insurance appeal drafted from published reviews, stopped at a Strands interrupt | 33 commits; strong statutory grounding.                                                                                                                                            |
| HeyGilli    | Kids’ YouTube buddy with parent briefings                                                  | 3 people, 308 commits, 4:52 video.                                                                                                                                                 |
| Prems       | Paris apartment hunting for a family                                                       | 4,845-word narrative, 87 commits, 3:53 video, no AgentCore.                                                                                                                        |
| Minutes     | IEP service-minute tracking                                                                | Repository link returns 404 during judging.                                                                                                                                        |

L’Ayalga’s repository: created 29 August, 239 commits, MIT, `main` frozen at v1.3.11 on 14 September. Demo video 3:11 with 5 views on 22 September; rivals’ videos show 0 to 53 views, so judges have not visibly reached most entries or watch embedded.

INFERRED criterion read:

- Technical Implementation: strong. TypeScript Strands on AgentCore Runtime with Memory, ADOT tracing, durable interrupts and a production probe gate. Most rivals are Python, and only a fifth of the track shows the full deployment stack.
- Design: strong. Bilingual complete product with cancellation, guest return, reminders and recovery paths.
- Potential Impact: weakest criterion. Guests visiting a shared country house reads narrower than caregiving, insurance appeals or family admin, and the entry states that human time saved was not measured. The lived-problem credibility is real but the page does not generalise it.
- Creativity & Originality: mixed. The page leads with the track’s common framing; the unique angle (two hosts inviting independently, memory-ranked rooms, social exceptions as the only interrupt) sits lower.
- Presentation: adequate. Video within limit, one coherent routine → exception → follow-through story, but no captioned screenshot gallery.

If Technical and Design dominate, L’Ayalga is in the top five of the track. If Impact and story dominate, Shoulder and the caregiving cluster win.

## Lessons taken from Spoken Letter (VERIFIED from its documents)

Spoken Letter competed in XPRIZE and an Alexa+ hackathon, reached the XPRIZE Top 100 on 2026-09-08 and missed the Top 5. Its parameters differ (revenue-scored, public gallery with likes), but these transfer:

- Judges score from the page, video and repository; the official judge accounts never signed in to the product (`docs/agents/xprize-contender-watch-report.md:25-27`). Proof must live on the submission page. L’Ayalga’s page has the video and zero gallery images, while Shoulder, Quiet Hours, Hestia and Kith use five to ten captioned screenshots as their evidence.
- Anything linked from the frozen submission is still being scored during judging, and a dead link is scored (`competitive-analysis-2026-08-22.md:433-443`; `competitive-analysis-2026-09-08-top-100.md:277-279`). Minutes’ 404 repository is the live example. Production and the AgentCore runtime must stay healthy through 8 October, and the shared demo reset is a risk if two judges arrive at once.
- Likes never counted and the competitor tracker changed no decision (`competitive-analysis-2026-08-22.md:33, 392-401`). Nothing to build here.
- Name the weakness before the judge does (`competitive-analysis-2026-09-08-top-100.md:281-284`). Already the house style of the judge guide.
- Every sponsor service must do real work in code and be documented; decorative usage is a liability (`docs/research/2026-09-03-alexa-plus-hackathon-mcp-add-on.md:240`). L’Ayalga’s Strands inventory already maps each service to code.

Not transferable: the revenue, P&L and paying-customer apparatus, and paid acquisition as evidence.

## Open checks

1. Whether Devpost still allows edits to the submitted entry. If it does, add captioned screenshots of the host decision, the guest room ranking with matched preferences, and the escalation outcome. If it is locked, nothing changes.
2. Keep the nine production probes and the AgentCore runtime green through 8 October. Do not modify `main`.
3. No competitor tracking or likes campaign. Neither affects the score.

## Reproduction

The snapshot JSON beside this file holds one row per entry with the flags used above. It was produced by fetching each gallery page (`?page=N`, 24 entries per page), resolving tracks through `/submissions/search` with the `filter[which track are you entering your project into?][]` parameter, then fetching each project page and parsing the `app-details-left` block, the `software-urls` list, the `cp-tag` list and the `software-team-member` count. Devpost returned 403 to a bare `Mozilla/5.0` user agent and 200 to curl’s default agent.
