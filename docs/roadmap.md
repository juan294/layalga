# Current product and remaining work

Updated October 15, 2026. The hackathon period closed on 2026-10-14, and the [hackathon archive](archive/hackathon/README.md) keeps the submission material. Production runs v2.0.0, real-use release 1 (2026-10-15), without demo mode. The next step is release 2, which drops the leftover demo schema. Dated research and earlier plans record the decisions that led here; they are not a current backlog.

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
- Release 2 (phase 6): after release 1's AgentCore runtime version is recorded, drop the demo schema and remove the demo predicates from the retention function.

## Remaining owner and operational actions

- Complete a real consenting recipient verification/reminder/return/opt-out proof after authorization. Provider acceptance, inbox delivery and a guest reply are different observations.
- Expand the existing bounded WebMCP progressive enhancement. The current implementation registers narrow host and guest tools only when the browser exposes `document.modelContext`; the larger agent-facing product direction remains future work.
- Run the archived [participant protocol](archive/hackathon/participant-protocol.md) with willing hosts and guests. Record baseline effort, task completion and confusion before making human time-saving or adoption claims.
- Redraw the draw.io architecture view, which still shows the removed demo guide and clock (the Mermaid sources are current).

## Deliberately deferred

Per-night room packing, room photography, two-way Google/iCloud calendar writes, a remote OAuth MCP service, and messaging-channel integrations remain outside this completion. WhatsApp and Twilio remain excluded. These would add product and authorization scope before the booking lifecycle has real household use.

The main remaining uncertainty is evidence from real people using the product.
