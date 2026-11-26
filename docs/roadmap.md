# Current product and remaining work

Updated November 26, 2026. Production runs v2.5.3 at `26434e1` (live health recorded in the release evidence, 2026-11-25), described under "Latest releases". Both real-use launch releases are complete, and demo mode and its schema are gone. The [hackathon archive](archive/hackathon/README.md) keeps the judged submission. Dated research and earlier plans record decisions; they are not a current backlog.

## Implemented in the completion

| Need                                           | Current behavior                                                                                                             | Evidence route                                                                                      |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Guests or hosts change their mind              | Explicit cancellation or pre-booking withdrawal releases rooms and retires stale work; natural language prepares review      | [Guest manual](guides/guest-manual.md), [cancellation service](../src/core/booking/cancellation.ts) |
| Access must last through a stay                | Finite initial access extends through at least checkout plus seven days; cancellation and revocation remain authoritative    | [Invitation lifecycle](../src/core/booking/invitations.ts)                                          |
| Ordinary information should not interrupt      | Informational notes and arrival details are separate from persisted explicit requests                                        | [Host manual](guides/host-manual.md)                                                                |
| Household rules belong to the hosts            | Validated, versioned pets/children settings serialize with booking; pending approvals recheck current policy                 | [Policy settings](../src/core/policy/settings.ts)                                                   |
| Guests need a way back to reminders            | Optional verified contact, explicit consent, revocable return access and separate delivery evidence                          | [Guest email readiness](release/guest-email-readiness.md)                                           |
| Remembered preferences should affect a choice  | Current-party recall ranks feasible rooms and explains matches/fallbacks; guests choose and policy still applies             | [Preference recall](../src/core/memory/room-preferences.ts)                                         |
| Hosts need to see decisions and outcomes first | Decision/capture/current-visit sections precede room administration; completed capture prepares a private link automatically | [Host manual](guides/host-manual.md)                                                                |

## Real-use launch

The [real-use launch plan](plans/2026-10-15-real-use-launch.md) has six phases. Phases 1 to 4 change only the repository: tests and release probes move to real local Supabase sessions and fixture households, the application loses demo mode, Google becomes the only sign-in, and the documentation follows. Phases 5 and 6 are production work, and each production action needs explicit owner authorization:

- Release 1 (phase 5): shipped as v2.0.0 on 2026-10-15 (main `e0cb4d1`, AgentCore runtime version 38). Email sign-in is off, the demo variables are gone from Vercel production, the conversion migration is applied, the new production gate passed, and the owner signed in with Google to the empty household. The synthetic Vega and Parker memory is forgotten. v2.1.0 followed the same day (main `ed6c574`, AgentCore runtime version 39): the public privacy notice, guest sign-in from the main page and the orphaned-memory sweep. The Google OAuth app is published.
- Release 2 (phase 6): shipped as v2.2.0 on 2026-10-16 (main `3e433f1`, AgentCore runtime version 40). The demo schema is gone from production, and retention applies the same thresholds to every home.
- v2.2.1: shipped 2026-10-17 (main `78ddbbc`, AgentCore runtime version 41). A dependency and security update with no migrations: it patches eight OpenTelemetry database instrumentations in the web workspace and the AgentCore bundle. `braces` (GHSA-vfj7-8cjw-p6xm) stays open because the advisory lists no patched release.
- v2.3.0: shipped 2026-10-17 (main `af82880`, AgentCore runtime version 42). Sign-in identity, with no migrations: the header shows the signed-in Google account (verified email and avatar, monogram fallback), Google always offers its account picker, and the host dashboard is titled "Household ledger". The owner check on the real Google account (picker, avatar field) is still open.
- Next.js 16.4.2 security hotfix: shipped 2026-10-22 (main `339b62a`, pull request #211, no version bump; AgentCore stays on runtime version 42). It patches CVE-2026-96889 (Image Optimization RCE), GHSA-673q-mjm6-r5xr (`use cache` RCE) and GHSA-p3m5-59mp-jv5r (Server Actions DoS). Production probe run 39753158349 passed. The local browser repeat on `next dev` still shows the server action stream hang that 16.4.0 and 16.4.1 had (3 of 64 runs); its effect on production is unknown.

## Remaining owner and operational actions

- Complete a real consenting recipient verification/reminder/return/opt-out proof after authorization. Provider acceptance, inbox delivery and a guest reply are different observations.
- Expand the existing bounded WebMCP progressive enhancement. The current implementation registers narrow host and guest tools only when the browser exposes `document.modelContext`; the larger agent-facing product direction remains future work.
- Run the archived [participant protocol](archive/hackathon/participant-protocol.md) with willing hosts and guests. Record baseline effort, task completion and confusion before making human time-saving or adoption claims.
- Redraw the draw.io architecture view, which still shows the removed demo guide and clock (the Mermaid sources are current).
- Decide on the read-only connected-assistant channel. It is implemented in the repository, dark and not released: `ASSISTANT_ACCESS` defaults to `none`, and the hosted access token hook and OAuth server stay off. After a release, the [activation runbook](release/assistant-access-activation.md) turns it on in gates G0 to G7, and each gate needs its own owner authorization. The plan is `plans/2026-11-25-read-only-mcp.md`.

## Deliberately deferred

Per-night room packing, room photography, two-way Google/iCloud calendar writes, assistant tools that prepare or send a request, and messaging-channel integrations remain outside this completion. WhatsApp and Twilio remain excluded. These would add product and authorization scope before the booking lifecycle has real household use.

The main remaining uncertainty is evidence from real people using the product.

## Latest releases

v2.3.1 shipped 2026-10-27 (main `a3524ee`, pull request #220, AgentCore runtime version 43 per the release evidence): the pre-launch reliability fixes, with no migrations.

v2.4.0 shipped 2026-11-19 (main `587f42c`, pull request #229, AgentCore runtime version 44; [changelog](../CHANGELOG.md#240---2026-11-19)): explicit returning-party choice and shared family names (migration `20261119000100`), recoverable invitation links (migration `20261118000200`), the November 18 triage fixes and a dependency update. It rolled out in the [staged order](release/e2e-pro-playbook.md#v240-rollout-order). Guest email activation remains separate.

v2.5.0 shipped 2026-11-21 (main `64d6aa1`, pull request #230, AgentCore runtime version 45; [changelog](../CHANGELOG.md#250---2026-11-21)): guest-initiated booking. Hosts can publish their household name, guests can find a listed home, compare dates and rooms and send a stay request, and one host confirms or declines it. Compatible browsers get four WebMCP tools. Four migrations dated 2026-11-21 (`20261121000100` to `20261121000400`) run before the web deploy.

v2.5.1 shipped 2026-11-22 (main `dc12595`, pull request #231, AgentCore runtime version 46, no migrations; [changelog](../CHANGELOG.md#251---2026-11-22)): guests sign in with Google before they search for a household, check availability or prepare a stay. The sign-in restores the selected household and dates, and a draft belongs to the account that prepared it.

v2.5.2 shipped 2026-11-25 (main `c1e65fb`, pull request #239, AgentCore runtime version 47, no migrations; [changelog](../CHANGELOG.md#252---2026-11-25)): the guest conversation fix and postgres.js 4.1.1 without pipelining outside transactions.

v2.5.3 shipped 2026-11-25 (main `26434e1`, pull request #240, AgentCore runtime version 48, no migrations; [changelog](../CHANGELOG.md#253---2026-11-25)): web sign-in refuses connected-client tokens, which is the first condition for external agent access, and sign-out works during a sign-in service outage.
