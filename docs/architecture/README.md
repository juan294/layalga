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

**Stale as of 2026-09-04.** This file still describes the pre-AgentCore state: its subtitle and zone ZC say the local durable worker is selected and AgentCore is "proven but not the selected runtime" (`E2`, and legend entry `LG7`), and it has no nodes for AgentCore Memory, host email pings, or OpenTelemetry tracing. `/Applications/draw.io.app` is not installed in this environment, so the paired PNG export (which embeds the XML and must match it) cannot be regenerated here; hand-editing dozens of precisely positioned, cross-referenced nodes and legend text without being able to render and check the result risked leaving the file internally inconsistent, which is worse than leaving it visibly stale. `layalga-architecture.mmd`, its rendered SVG and PNG, and the prose above are current. Refresh this file the next time draw.io is available to render and verify it.
