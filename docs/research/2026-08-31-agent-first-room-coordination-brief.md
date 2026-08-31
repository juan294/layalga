# Design Brief: Agent-First Room Coordination

> Brainstormed on 2026-08-31 from the current L’Ayalga implementation, the private house-source review, Juan's current room rules, and current official platform documentation.

## Problem

L’Ayalga knows how to allocate generic rooms, but it does not yet know the real inventory of a host's home. The current demo uses three synthetic rooms with only names and bed counts. Guests choose dates and party details while the booking engine chooses rooms automatically. Hosts can see the result, but they cannot configure the inventory, block a room for a private stay, open an overflow room for selected dates, or let a guest reserve exact rooms.

The real household has cases that a bed total cannot express. A basement room normally sleeps two on a sofa bed but can sleep four when a double air mattress is approved. The office can sleep two on an air mattress, but it is normally unavailable and is the last room the host wants to offer. A host also needs to remove a room from rotation for a private stay, such as a family member who will never use the guest application.

The coordination must remain agent-first. A person should be able to state intent such as "My mother is staying in the basement room from Friday to Monday" or "Find two rooms for four people" and let L’Ayalga structure, check, and prepare the action. Code and PostgreSQL must still own availability, capacity, authority, and concurrency.

## Goal

Make the house inventory and room calendar authoritative, then let hosts, guests, and browser agents coordinate exact rooms through the same safe, auditable operations.

## Scope

**In:**

- Host-managed room inventory with guest-visible labels, floor, sleeping arrangement, standard capacity, maximum capacity, default availability, overflow behavior, display order, and separate private host notes.
- A fail-closed setup state: a room with incomplete capacity or availability data does not enter guest allocation.
- Date-bound host controls to block an available room or open a normally withheld room.
- Manual private occupancy that removes one or more rooms from guest availability without creating a fake guest or invitation.
- Guest selection of one or more exact rooms from the rooms available for the chosen dates.
- A deterministic room recommender that proposes the smallest sufficient standard-capacity set before the guest chooses.
- Explicit overflow handling when a request depends on air mattresses or capacity above the room's standard arrangement.
- A single database occupancy boundary shared by guest visits and host-created blocks.
- Host and guest WebMCP tools that reuse the authenticated page or invitation capability and the existing application operations.
- Human confirmation before a WebMCP or host-agent write changes room availability or submits a booking.
- A revocable, host-only iCalendar subscription feed for confirmed household stays and private blocks.
- English and Spanish copy, responsive behavior, keyboard access, and the existing Paper Ink visual identity.
- Synthetic demo inventory that shows one standard room, one overflow room, and one normally withheld room without publishing the real house layout or photographs.

**Out for this cycle:**

- Publishing the private floor plans, Dropbox photos, GPS metadata, or real household documents.
- Importing financial, property, insurance, identity, employment, or official records into L’Ayalga.
- Telegram delivery, WhatsApp, Twilio, SMS, or email delivery.
- A remote MCP server for agents that are not operating in the authenticated browser page.
- Direct Google Calendar or Apple iCloud writes, two-way calendar sync, or retaining third-party calendar refresh tokens.
- Per-night room moves during one visit.
- Allowing a model to create occupancy, reveal hidden rooms, or override capacity without deterministic checks and the required human confirmation.

Telegram and a remote MCP server remain viable follow-on channels. They require separate identity binding, consent, revocation, rate limiting, and audit contracts. They do not precede the authoritative room model.

## Constraints

- PostgreSQL remains authoritative for rooms, availability, occupancies, visits, and blocks. The model does not infer whether a room is free.
- Guest visits and private blocks must contend on the same room/date exclusion constraint. A parallel block table without a shared concurrency boundary is not sufficient.
- The office is unavailable by default. A host can expose it for selected dates. Its current maximum is two people on a double air mattress.
- The basement room has standard capacity two on a sofa bed and maximum capacity four with an optional double air mattress. Capacity above two is an overflow arrangement, not normal inventory.
- The other real room names, current beds, and guest-availability states can be entered later through the host inventory interface. Their absence does not require invented seed data.
- Guest-facing data must exclude private notes, household member identities, other guest identities, and hidden-room details.
- Existing invitation capabilities, host identity mapping, exact-run polling, bounded queue execution, audit events, and prompt minimization remain in force.
- The WebMCP API is browser-mediated and page-scoped. The official design registers tools through `document.modelContext.registerTool()` and routes execution through page logic. It does not replace server authorization or validation ([WebMCP explainer](https://github.com/webmachinelearning/webmcp/blob/main/README.md)).
- WebMCP tools must use narrow schemas, mark read-only operations, label untrusted returned content, keep outputs bounded, and avoid cross-origin exposure by default ([Chrome WebMCP tool security](https://developer.chrome.com/docs/ai/webmcp/secure-tools)).
- A future remote MCP server would require OAuth resource binding, audience validation, PKCE, exact redirect validation, and no token passthrough. That is a separate security surface ([MCP authorization specification](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization)).
- The AWS hackathon submission deadline is 2026-09-14 at 17:00 PDT. The five judging criteria are equally weighted; Technical Implementation rewards thorough Strands use, while Design asks for a coherent product rather than a proof of concept ([official rules](https://agentsforhumans.devpost.com/rules)).

## Design options

### Option A: House truth plus shared capability surface

Build the inventory and occupancy model first. Put thin host UI, guest UI, Strands tools, WebMCP tools, and the calendar feed over the same application services. Let the coordinator recommend room sets and prepare host blocks, but make people confirm consequential writes.

This option is selected. It strengthens the existing product story: natural language expresses intent, the agent coordinates, deterministic code proves availability, PostgreSQL prevents races, and humans retain social authority. It also produces one coherent demo across host, guest, agent, and calendar surfaces.

### Option B: Telegram-first concierge

Add a Telegram bot that accepts host and guest messages before changing the room model. This provides a familiar conversational surface, but it would still depend on generic room counts. It also introduces chat identity binding, invitation linking, consent, webhook security, and outbound-message policy before the core data is ready.

This option is deferred. Telegram can later call the same room operations without redefining booking semantics.

### Option C: Remote MCP server first

Expose booking tools to external agent clients immediately. This offers broad agent compatibility, but it adds an OAuth resource server, client interoperability, token lifecycle, and a larger privacy boundary. It also does not solve the host's manual room-control problem by itself.

This option is deferred. WebMCP proves agent-operated booking through the existing authenticated browser boundary first.

### Option D: Manual room administration only

Add room forms, exact room selection, and blocks without new agent tools. This is the smallest implementation, but it turns the coordinator into a normal reservation interface and leaves the hackathon's strongest differentiation unused.

This option is rejected.

## Chosen approach

### One room truth

Room inventory separates normal capacity from maximum capacity and distinguishes normal sleeping arrangements from overflow arrangements. A room can be normally bookable, withheld by default, or inactive. Date-bound overrides can close a normal room or open a withheld room.

Every use of a room becomes an occupancy with one date range and one source: either a guest visit or a host-created private block. The database enforces that a room cannot have overlapping active occupancies, regardless of source.

### Agent proposes, person commits

The coordinator receives typed tools to read inventory, recommend rooms, prepare a private block, and explain why a room set is or is not possible. A host message can become a structured block proposal. A guest request can become a recommended room set. The final host block and final guest submission require a visible confirmation tied to the exact dates and room identifiers.

Overflow capacity remains a social decision. When the basement request needs more than its standard two places, the policy produces an approval interrupt with the exact extra arrangement. The office does not appear to guests until a host opens it for the requested dates.

### Browser-agent access

The host page registers read tools for household availability and write-preparation tools for blocks and date-bound room opening. The guest page registers invitation-scoped tools for room options and booking preparation. WebMCP execution calls the same server actions and services as the visible interface. It never receives a database connection or a broader token.

The browser agent can complete the repetitive work, but the visible page owns confirmation. This makes agent action legible in the demonstration and preserves the existing authority boundary.

### Calendar as output

A host can create and revoke a signed iCalendar feed. Confirmed visits and private blocks use stable event identifiers and all-day half-open dates. Private guest details and block notes are reduced to host-safe calendar text. The family calendar subscribes to the feed; L’Ayalga remains the source of truth.

This retains the product principle that the calendar is an output of coordination, not the coordinator itself.

### Interface direction

The new host surface is a house ledger rather than a generic settings page. Each room is a horizontal "door card" with its normal arrangement, overflow arrangement, and date state. A compact room strip aligns with the existing monthly visit ledger, so a host can see which doors are open, occupied, privately blocked, or withheld.

The guest surface presents the coordinator's recommended room set first, then lets the guest inspect and change the exact rooms. Copy names what the guest controls: "Choose rooms," "Use the air mattress," and "Ask the hosts," not database or policy terms.

The design keeps the established L’Ayalga visual identity. Its one new signature is the door-state strip: a quiet plan-like row whose door marks change with availability and whose structure comes from the actual house rather than decorative dashboard cards.

## Success criteria

### Automated

1. Inventory validation fails closed for incomplete or inactive rooms and never exposes private notes to guest loaders, prompts, WebMCP results, or calendar output.
2. A normally available room can be blocked for a date range, and a normally withheld room can be opened for a date range.
3. Guest visits and host blocks race through one exclusion boundary; only one overlapping occupancy can win.
4. The recommender returns the smallest sufficient standard-capacity room set with deterministic tie-breaking.
5. A guest can select one or more exact available rooms, and the transaction rejects missing capacity, hidden rooms, inactive rooms, stale choices, cross-home identifiers, or overlap.
6. Basement occupancy for one or two people uses standard capacity. Three or four produces an overflow approval interrupt. More than four is denied.
7. The office is absent from guest options by default and appears only for dates a host opened it.
8. Host block and room-opening operations are idempotent, audited, home-scoped, and safe across retry.
9. WebMCP read tools return the same authorized state as the visible page. Write tools prepare the exact action but cannot bypass the visible confirmation or server authorization.
10. The iCalendar feed is token-scoped, revocable, stable across repeated reads, valid as iCalendar, and excludes guest tokens and private notes.
11. English and Spanish unit, integration, component, and Playwright coverage exercises room setup, host block, exact guest selection, overflow approval, WebMCP registration, and calendar output.

### Manual

1. A host enters or completes the synthetic house inventory in the house ledger.
2. The host tells L’Ayalga that a family member will use a room for selected dates; the agent prepares the block, the host confirms it, and the room disappears from guest options.
3. A guest asks a browser agent for a stay for four people. The agent reads the invitation-scoped options, recommends multiple rooms, prepares the choice, and the guest confirms it on the page.
4. The host opens the normally withheld office for a selected date range and sees it enter availability only for those dates.
5. A basement request above standard capacity pauses for host approval and resumes exactly once.
6. The family-calendar subscription shows the confirmed visit and private block without exposing private application data.
7. The complete room story fits as a clear extension of the existing five-minute hackathon video rather than a second disconnected product.

## Open risks

- The current household-facing names, bed arrangements, and normal availability of the remaining first-floor rooms are not confirmed. The admin-first setup prevents the implementation from inventing them.
- WebMCP remains an evolving browser API. The visible UI remains complete without it, and the implementation treats WebMCP as progressive enhancement.
- Calendar subscription refresh timing is controlled by the calendar client. The feed can prove correct output but cannot force every client to refresh immediately.
- The unified occupancy migration changes the current `visit_rooms` foundation and therefore requires database-backed concurrency and migration verification before any remote database action.
- Real room photographs would improve selection but would also publish sensitive property imagery. They remain excluded until the hosts make a separate publication decision.
