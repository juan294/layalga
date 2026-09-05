# Architecture diagram

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

Calendar text is deliberately generic. It can contain guest counts and guest-visible room labels. It cannot contain guest names, email addresses, invitation text, special requests, arrival information, private notes, or tokens. Phase 6 proves this boundary with local parsing only. A live family-calendar subscription, direct calendar writes, Telegram, and a remote OAuth-protected MCP server remain separate follow-ons.

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

**Refreshed 2026-09-04.** The draw.io view now matches the AgentCore-selected state recorded in ADR 0002: Amazon Bedrock AgentCore Runtime is the selected production execution path with the local worker as the one-flag rollback, and the AWS zone carries AgentCore Memory (with the host page list and Forget edge), Amazon SES host-only email pings fed by the `host_email_pings` outbox, and ADOT for Node tracing to CloudWatch GenAI Observability. EventBridge Scheduler remains the dashed future item. The paired PNG embeds the diagram XML, so it must be regenerated with the command above after every edit to the `.drawio` file.

## Supporting diagrams

Four smaller Mermaid sources sit next to the topology diagram. Each has a committed SVG rendered with the same Mermaid CLI, config, theme, and background as above.

- `request-lifecycle.mmd`: the sequence from a browser submit through the queued `runs` row, the immediate acknowledgement, browser polling of `GET /api/runs/{id}`, the `execute_run` dispatch to AgentCore (or the local `after()` path), the Strands model-and-tool loop, and the Vercel Cron tick that recovers stale leases, drains the queue, claims due jobs, and sends host email pings.
- `interrupt-resume.mmd`: the sequence for a gated tool such as `create_temporary_hold`: the policy hook's room and overlap verdicts, the `host_decision` interrupt and session snapshot, the pending decision and its SES ping, the host's approve or decline, the resume run that re-checks the verdicts and overflow fingerprint before the tool executes once, and the `application_error` failure path with the host Retry button.
- `reconfirmation-state-machine.mmd`: the visit states from `hold` through `confirmed`, `reconfirm_pending`, `reconfirmed`, `escalated`, and `cancelled`, plus the `scheduled_jobs` lifecycle with its 10 minute lease, the 1 minute and 5 minute retry ladder, quarantine on the third failure, and the deterministic notification fallback.
- `memory-namespaces.mmd`: the single AgentCore Memory resource, its per-party namespace and two extraction strategies, which agent tasks read or write it, the deterministic name-free capture event, tool-driven recall and its audit, the host panel list and Forget path, and the family-name boundary.

Render any of them with the same command family, substituting the file name:

```bash
pnpm dlx @mermaid-js/mermaid-cli@11.12.0 \
  -i docs/architecture/request-lifecycle.mmd \
  -o docs/architecture/request-lifecycle.svg \
  -c docs/architecture/mermaid-config.json \
  -t neutral -b '#f7f1e5' -w 1600
```
