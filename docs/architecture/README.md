# Architecture diagrams

These sources describe the September 5 implementation. The selected execution topology remains AgentCore Runtime with the local runtime fallback. The new guest delivery path is implemented and tested locally; its migrations, guest SES IAM policy, production rollout and real-recipient proof remain pending separately authorized operations. See [guest email readiness](../release/guest-email-readiness.md).

`layalga-architecture.mmd` is the source. `mermaid-config.json` fixes the render settings. The committed SVG and PNG were generated with Mermaid CLI 11.12.0:

```bash
pnpm dlx @mermaid-js/mermaid-cli@11.12.0 \
  -i docs/architecture/layalga-architecture.mmd \
  -o docs/architecture/layalga-architecture.svg \
  -c docs/architecture/mermaid-config.json \
  -t neutral -b '#f7f1e5' -w 1600

pnpm dlx @mermaid-js/mermaid-cli@11.12.0 \
  -i docs/architecture/layalga-architecture.mmd \
  -o docs/architecture/layalga-architecture.png \
  -c docs/architecture/mermaid-config.json \
  -t neutral -b '#f7f1e5' -w 1600 -s 1
```

If Puppeteer cannot find a browser, set `PUPPETEER_EXECUTABLE_PATH` to a local Chrome or Chromium executable before running the commands.

## Room coordination extension

The diagram shows the runtime topology. The room coordination feature stays inside those existing trust boundaries:

```text
host or guest page
  -> authenticated Server Action or invitation capability
  -> deterministic room availability and recommendation services
  -> home-scoped PostgreSQL transaction
  -> shared room occupancy exclusion constraint
```

Rooms have separate standard and maximum capacities. Standard capacity can proceed without extra review. A selection that fits only at maximum capacity pauses with the exact overflow arrangement and needs host approval. A selection above maximum capacity is denied. The booking transaction reads the selected room IDs again before it creates or changes an occupancy.

Guest visits and private host blocks use the same room and date exclusion boundary. Hosts can also add non-overlapping date controls: an available room can be closed, and a withheld room can be opened for a full stay. Draft, inactive, incomplete, occupied, closed, and unopened withheld rooms fail closed.

## Visible agent authority

The Strands coordinator can read guest-safe room facts and prepare a durable room-action proposal. It cannot apply a private block, opening, or closure. The authenticated host page displays the dates, rooms, and effect before a host applies the proposal through the normal web service.

WebMCP reuses the active page authority. Host and invitation pages register bounded read and preparation tools only when `document.modelContext` exists. The tool schemas do not accept a home ID, host ID, invitation token, or database record. Preparation changes visible form state and does not submit a write. The same pages remain fully usable when WebMCP is unavailable.

## Calendar capability

Each iCalendar feed has a separate random bearer token. PostgreSQL stores only its purpose-bound HMAC, and a host can revoke each feed independently. A feed read does not mutate booking state. It publishes deterministic all-day events for eligible visits and active private room use, with cancellation tombstones and stable event identifiers.

Calendar text is deliberately generic. It can contain guest counts and guest-visible room labels. It cannot contain guest names, email addresses, invitation text, special requests, arrival information, private notes, or tokens. Local parsing tests prove this boundary. A live family-calendar subscription, direct calendar writes, Telegram, and a remote OAuth-protected MCP server remain separate follow-ons.

## Current coordination boundaries

Hosts see decisions, capture and current visit outcomes before room administration. Informational notes are stored separately from explicit requests; only the latter enter the approval policy. Host policy settings use an expected version and the same home advisory lock as booking. Changes recheck queued approvals without rewriting existing confirmed stays. Explicit cancellation or invitation withdrawal retires dependent work and access.

An unbooked invitation starts with a 30-day bearer lifetime. Confirmation and rescheduling preserve nonrevoked access through at least finite checkout plus seven days. Optional guest reminder contact requires explicit consent and either a server-verified Google address or account-free verification POST. Purpose-separated verification and return capabilities bind contact generation and the current invitation fingerprint; every return-session request checks live access. No original bearer is recovered to build email links.

Guest delivery runs only in the web boundary. The final authorization records an attempt under the shared home lock after checking current contact, invitation, visit, job and prearrival state. SES runs outside that transaction. Accepted receipts remain truthful after later opt-out; unresolved authorized sends become unknown and are not blindly retried. In-app reminders and guest silence remain separate facts from provider acceptance. Synthetic homes never send guest email.

Room search also reads the exact party memory namespace deterministically, bounded to three pages, 100 records and two seconds. Supported floor and bed preferences influence feasible recommendations after standard capacity and room count; the guest retains exact-room choice. Missing, off, conflicting or unusable memory falls back visibly. Ground-floor preference is not proof of accessibility.

The shared demo starts fresh routine and exception scenarios explicitly. Semantic clock controls select persisted eligible chase or escalation jobs, respect current cycles and retries, never move backwards, and report no work honestly. Guest date defaults use the household clock and timezone. The public judging path uses bounded demo-session entry rather than advertised fixed bearer links.

## Real-house setup boundary

The repository contains synthetic room fixtures only. A host adds real room facts through the authenticated room ledger. Incomplete inventory remains draft and unavailable. Real house plans, photographs, source paths, and private notes do not belong in the repository, prompts, guest output, WebMCP output, audit payloads, or calendar text.

## Draw.io diagram

`layalga-architecture.drawio` is a second, more detailed view of the same
system, drawn as native draw.io XML. It names the concrete routes, tools,
tables and roles rather than the boxes-and-labels summary above.

`layalga-architecture.drawio.png` is the paired export. It embeds the full
diagram XML, so opening the PNG in draw.io recovers the editable source.
Regenerate it after editing the XML:

```bash
/Applications/draw.io.app/Contents/MacOS/draw.io \
  -x -f png -e -b 16 -s 1.5 \
  -o docs/architecture/layalga-architecture.drawio.png \
  docs/architecture/layalga-architecture.drawio
```

**Source refreshed 2026-09-05.** The draw.io view includes consented guest delivery and return access, policy settings, cancellation, informational notes, scoped preference ranking and the guided semantic demo. Its lower detail cards explain the new security boundaries and pending guest rollout. EventBridge Scheduler remains a future item. The paired PNG embeds the diagram XML and must be regenerated after every native-source edit; the export does not establish a production deployment.

## Supporting diagrams

Four smaller Mermaid sources sit next to the topology diagram. Each has a committed SVG rendered with the same Mermaid CLI, config, theme, and background as above.

- `request-lifecycle.mmd`: accepted work, exact-run polling and dispatch, automatic authorized post-capture handoff, and cron host/guest delivery with separate attempt receipts.
- `interrupt-resume.mmd`: the sequence for a gated tool such as `create_temporary_hold`: the policy hook's room and overlap verdicts, the `host_decision` interrupt and session snapshot, the pending decision and its SES ping, the host's approve or decline, the resume run that re-checks the verdicts and overflow fingerprint before the tool executes once, and the `application_error` failure path with the host Retry button.
- `reconfirmation-state-machine.mmd`: the visit states from `hold` through `confirmed`, `reconfirm_pending`, `reconfirmed`, `escalated`, and `cancelled`, plus the `scheduled_jobs` lifecycle with its 10 minute lease, the 1 minute and 5 minute retry ladder, quarantine on the third failure, and the deterministic notification fallback.
- `memory-namespaces.mmd`: the single memory resource, per-party extraction and tool recall, deterministic bounded preference reads, host list/Forget, and the distinction between omitted identity fields and potentially identifying raw free text.

Render any of them with the same command family, substituting the file name:

```bash
pnpm dlx @mermaid-js/mermaid-cli@11.12.0 \
  -i docs/architecture/request-lifecycle.mmd \
  -o docs/architecture/request-lifecycle.svg \
  -c docs/architecture/mermaid-config.json \
  -t neutral -b '#f7f1e5' -w 1600
```
