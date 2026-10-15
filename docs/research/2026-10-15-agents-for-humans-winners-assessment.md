# Agents for Humans winners compared with L’Ayalga

Assessment date: 15 October 2026. Scope: explain the winners' observable advantages and the lessons for L’Ayalga, without claiming access to judges' reasoning.

## Conclusion

L’Ayalga presents substantial implementation and operational evidence. Its weaker competitive case is the demonstrated importance of the problem, the visibility of the agent's distinctive contribution, and evidence that people benefit from the resulting workflow. The strongest winners compress those three things into a readily understood story. Several also evaluate model behavior on varied inputs more directly than our scripted coordination benchmark does.

This is an assessment of public evidence, not a reconstruction of private scores. Public project pages and repositories can change after submission. Findings about current materials do not prove what the judges saw at the deadline.

## Baseline, method and boundaries

- Local worktree: `/Users/juan/code/layalga`, branch `develop`, baseline commit `185b7d5f4f40333fd8dcee84fc0203b503c70ecb`; initially clean and three commits ahead of `origin/develop`.
- Product submission: [public L’Ayalga project](https://devpost.com/software/l-ayalga), inspected through Chrome. It describes the live v1.3.10 release and links several evidence documents at v1.3.9. Current local documentation additionally describes v1.3.11. These identities must remain distinct.
- Existing production evidence: the repository records a v1.3.2 exact-candidate run at `90b68385a590144d6d44cd7dd41298180b2d182c`. This assessment did not rerun it or establish present production health.
- Queried the local Graphify graph first, then confirmed relevant source and submission documents. The graph's broad result was insufficient for the comparison; source and primary external evidence govern the findings.
- Three bounded, read-only investigations covered Everyday, Professional and Good Neighbor winners; the parent covered Tally, our submission, synthesis and this artifact. All required investigations returned results.
- Reviewed all ten winning project pages, selected linked README/evaluation artifacts, the three Everyday winners' video transcripts, and sampled video openings. Our video availability and 3:11 duration were checked; its local recording script supports narrative comparison. This was not a complete audiovisual review of all ten videos or a usability study.
- No competitor tests or agent runs were executed. One read-only Instanter statistics endpoint was checked. No installation, production mutation, publication or implementation occurred. This document is the sole intended local change.

The [official rules](https://agentsforhumans.devpost.com/rules) equally weight technical implementation, design, potential impact, creativity/originality and presentation. They also permit up to 0.6 bonus points for eligible Builder articles. L’Ayalga's three published articles mean a missing-blog explanation is unsupported. The rules permit portfolio updates after the submission deadline, which limits retrospective certainty.

## Winners and their comparative strengths

Awards were verified on the individual Devpost pages. L’Ayalga entered Everyday Agents. Professional and Good Neighbor winners provide lessons, rather than evidence that they occupied our track's award places.

| Award                | Project                                                        | Observable comparative advantage                                                                                                                                                                  |
| -------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Grand Prize          | [Tally](https://devpost.com/software/tally-hi3t0w)             | A specific daily burden for child-care providers; food photos become records and actionable corrections before the meal ends. Model evaluation on uncurated photographs strengthens the AI claim. |
| Everyday Gold        | [Shoulder](https://devpost.com/software/shoulder)              | Family caregiving inequity gives coordination immediate emotional stakes. Private agents negotiate constraints that a shared calendar cannot resolve.                                             |
| Everyday Silver      | [Cahoots](https://devpost.com/software/cahoots)                | Agents discover useful relationships and negotiate introductions. The team reports early exposure to real people, beyond a synthetic walkthrough.                                                 |
| Everyday Bronze      | [StepSpotter](https://devpost.com/software/stepspotter)        | A photo-based next-step and verification loop makes the distinctive AI contribution and safety boundary readily visible.                                                                          |
| Professional Gold    | [Shopbell](https://devpost.com/software/shopbell)              | Finds consequential store-specific information in real external feeds, with an inspectable rejection log and correction loop.                                                                     |
| Professional Silver  | [Instanter](https://devpost.com/software/instanter)            | Connects deadline rigor to one memorable outcome: four of 46 synthetic deadlines differ from simple seven-day counting.                                                                           |
| Professional Bronze  | [OneDecision](https://devpost.com/software/onedecision)        | One approval leads to replay, explicit activation, fewer repeated decisions, and escalation of a near-match.                                                                                      |
| Good Neighbor Gold   | [Doorstep](https://devpost.com/software/doorstep)              | Heat-warning outreach has clear stakes and a complete escalation story, supported by live-model simulations and disclosed failures.                                                               |
| Good Neighbor Silver | [On The Line](https://devpost.com/software/on-the-line-wsbhkj) | Corrects stale community referrals, queues reverification after failure, and exports verified information for other directories.                                                                  |
| Good Neighbor Bronze | [Plainletter](https://devpost.com/software/plainletter)        | A library-desk workflow yields a concrete take-home result: understandable explanations, verified facts and a next action.                                                                        |

## Findings

### F1. The user consequence is weaker in our demonstrated case

Our audience is specific: households where multiple hosts independently invite friends and family. Our submission explains rooms, children, pets, requests and follow-up, but provides no measured frequency, coordination burden, adoption or satisfaction. See `docs/submission/devpost.md:11`, `docs/submission/devpost.md:13` and `docs/submission/pitch.md:31`.

Shoulder's opening establishes a caregiver at a hospital late at night and private constraints that make ordinary family negotiation difficult. Its [3:02 video](https://www.youtube.com/watch?v=yohxjyw9lQM) spends roughly its first 48 seconds establishing the people and conflict before showing agency. Our recording script begins with system behavior and moves to the routine form flow at 18 seconds (`docs/submission/video-script.md:24`, `docs/submission/video-script.md:28`). The likely presentation advantage is emotional comprehension, not simply higher production polish.

This does not mean high-stakes sectors automatically deserve awards or that household hospitality is unimportant. It means our evidence asks a reviewer to accept more of the need on assertion.

Disposition: supported comparative weakness; actual judge weighting remains unknown.

### F2. Our agent contribution takes more explanation

L’Ayalga uses language at invitation/change boundaries and Strands for tool execution and durable human interruption (`docs/submission/pitch.md:9`). Current source confirms real SDK session storage and policy hooks (`src/agent/agent.ts:44`, `src/agent/agent.ts:69`), deterministic checks before booking (`src/agent/policy-hook.ts:53`), interruption (`src/agent/policy-hook.ts:94`) and refreshed checks (`src/agent/policy-hook.ts:111`). This is substantive agent engineering.

However, the guest journey visibly resembles a booking application: a host sends a copied link; a guest searches and selects rooms; exceptions are reviewed. That makes the incremental value over forms, rules and reminders less self-evident (`docs/submission/devpost.md:17`, `docs/submission/devpost.md:19`). Tally's image interpretation, Shoulder's private negotiation and StepSpotter's visual verification communicate the need for a model more immediately.

The recommendation is to demonstrate a difficult, representative coordination task that language understanding resolves, while retaining deterministic booking authority. Replacing safe rules with model discretion would weaken the product.

Disposition: supported presentation/originality risk; no finding that our use of Strands is superficial.

### F3. Workflow correctness is better evidenced than user or model benefit

Our benchmark proves 30 scripted operations, persisted outcomes and zero failures in a particular local run. It explicitly excludes human effort, production reasoning quality and adoption (`docs/submission/coordination-evidence.md:3`, `docs/submission/coordination-evidence.md:44`). The separate historical production probes cover live integrations; neither establishes broad interpretation quality or reduced household workload (`docs/submission/devpost.md:45`).

Tally's [evaluation report](https://github.com/usv240/tally/blob/main/docs/EVAL.md) separates curated photographs from a less curated set: 35/45 correct, with nine of ten misses crediting nothing. These are recorded team results, not independently reproduced here. Its deterministic refusal checks are separate from vision evaluation. The demo people are fictional, speech input is unfinished, and the [README](https://github.com/usv240/tally) says it never submits a claim autonomously. Its advantage is stronger evidence for the central model task, not proven adoption or universal production completeness.

Doorstep's [report](https://github.com/anshsahny/doorstep/blob/main/evals/REPORT.md) tests live model dialogue, tool trajectories and attacks, and reports remaining urgent misses. Its projected outreach savings use an assumed human baseline. OneDecision's [24-case evaluation](https://github.com/mgraves-centrix/onedecision/blob/main/docs/evaluation-results.md) is explicitly scripted and synthetic. These different evidence types must not be combined into a claim that every winner validated general AI quality.

Disposition: supported evidence gap. Higher-value next evidence would measure interpretation errors, correct/needless interruptions, real messages exchanged, active coordination time and repeat use.

### F4. We still ask people to manage a substantial part of coordination

The [hackathon brief](https://agentsforhumans.devpost.com/) emphasizes background work and surfacing meaningful decisions. Our host copies/sends the invitation link; guests visit the website, search and select rooms. Guest email activation and consenting-recipient proof remain future work in the public submission (`docs/submission/devpost.md:49`). These are legitimate boundaries, but reduce the demonstrated disappearance of work.

Shopbell's [README](https://github.com/seominjea1942/compliance-radar/blob/master/README.md) describes discovery from five real sources and records what was suppressed. Its [demo analysis](https://github.com/seominjea1942/compliance-radar/blob/master/analysis/demo-candidates.md) selects concrete, comprehensible examples. Its store is fictional and triage errors are disclosed. Instanter's [live statistics](https://d2ew2t4uldglcr.cloudfront.net/api/stats) returned 48 synthetic cases, 46 computed deadlines and two refusals on 15 October; this checks current output, not legal validity or prevented harm. Both make the relationship between background work and a human decision easier to see.

On The Line's [README](https://github.com/Marc-Dvci/On-the-Line/blob/main/README.md) adds a distribution lesson: corrected information can serve multiple directories. Its [evaluation](https://github.com/Marc-Dvci/On-the-Line/blob/main/EVALUATION.md) distinguishes deterministic policy checks from model extraction; rendered demo calls are not evidence of real provider conversations.

Disposition: supported product friction and demonstration gap; no integration/channel expansion is authorized by this assessment.

### F5. Engineering strength does not establish a stronger overall entry

L’Ayalga's durable state, current-state rechecks, cancellation, privacy boundaries and documented AgentCore deployment are credible strengths. The five equal criteria prevent assuming that additional reliability work will outweigh a weaker impact or originality case.

Counterevidence prevents an overly flattering account of the winners:

- [Cahoots](https://devpost.com/software/cahoots) reports 25 friends/family onboarded and an early connection. This is stronger human exposure than our synthetic outcome evidence, but it is a team report, not independent adoption or retention proof. It also discloses an Anthropic fallback after Bedrock account trouble.
- [Shoulder's README](https://github.com/ahammadshawki8/Shoulder) places AgentCore Runtime and Memory on its roadmap. Our implemented deployment is stronger on those particular surfaces; its case is stronger in private negotiation and human stakes.
- [OneDecision's README](https://github.com/mgraves-centrix/onedecision) discloses session-local deployed SQLite; the complete teaching loop is local. Our documented durable persistence is a comparative strength.
- [Plainletter's examples](https://github.com/voyagi/plainletter/blob/main/examples/README.md) acknowledge that partially unreadable references reach downstream instructions. These text examples do not validate photographed-letter transcription or establish superior safety across all cases.
- [StepSpotter's September 11 evaluation](https://github.com/retailbox-automation/stepspotter/blob/main/docs/eval-results/2026-09-11.md) records an overall failure: two of three legitimate steps confirmed, while all three adversarial photos were rejected. This supports a clear demonstration and honest evaluation, not flawless verification. Its [current page](https://devpost.com/software/stepspotter) includes later reuse in another contest; later rubric language must not be attributed to this hackathon.

Disposition: reject the claim that all winners had better engineering, full autonomy, real adoption or proven human savings. The supported inference is that they often made their strengths matter more visibly to the rubric.

## Recommended direction and what would change this assessment

Prioritize evidence of a valuable recurring job before adding features or infrastructure. For L’Ayalga, observe households with repeated multi-host invitations, compare the existing chat/calendar process with the product, and measure coordination messages, active time, errors, interventions and willingness to use it again. Evaluate the live model on varied, consented or synthetic invitation/change language, with repeated cases and labeled outcomes. These are recommendations, not a study plan or permission to contact participants.

A stronger demonstration should follow one recognisable household conflict through to a useful outcome and show how much work disappears. Preserve the safety engineering, but explain each technical choice through the consequence it prevents. Additional AWS integrations alone are unlikely to address the largest supported gaps.

This conclusion could change with private judge feedback, a frozen submission snapshot, independently verified repeat use, measured human benefit, or broader model evaluation already conducted but absent from the inspected materials. No numerical retrospective score is justified.

## Handoff

Assessment complete; F1–F5 are recorded with dispositions above. The owner authorized a local commit and integration into `develop`; no implementation, release or remote publication is approved. The assessment baseline is `develop` / `185b7d5f4f40333fd8dcee84fc0203b503c70ecb`; the containing Git commit preserves this artifact. Source reads and external evidence retrieval are the completed assessment checks. The initial formatting check failed, formatting was corrected, and the subsequent check passed. No new test, build, deployment, inbox-delivery or competitor reliability result is claimed. Any next planning phase must revalidate the actual checkout, evidence identities and current product state before relying on this document.
