# Phase 1: Per-run agent timeline on the run status page `[batch-eligible]`

Depends on: Phase 0 merged for `executedOn` (the timeline itself works without it).
Branch: `feat/run-timeline`. No file overlap with Phase 4.

## Goal

The run status page and the embedded capture poller show what the agent did: each tool call, each policy verdict, each applied decision, in order, with the runtime label and token usage. Judges see the agentic loop instead of "queued, then done".

## Data (VERIFIED)

`public.audit_events` rows with `actor = 'agent'` carry `run_id` for kinds `tool_call`, `policy_verdict`, `decision_applied` (`supabase/migrations/20260831000200_agent.sql:32-40`). `layalga_web_runtime` already has `select` on the table.

## Tasks

- [ ] 1.1 API. In `src/app/api/runs/run-data.ts` add `events` to `RunSnapshot`:
  ```ts
  interface RunTimelineEvent { at: string; kind: "tool_call" | "policy_verdict" | "decision_applied"; name?: string; decision?: "allow" | "deny" | "interrupt"; }
  ```
  Query `select kind, payload, created_at from public.audit_events where run_id = ${id} and home_id = ${run.home_id} order by created_at, id`. Map `payload.name` for tool calls and `payload.decision` for verdicts. Never include `payload.reason`, room ids, or any free text. Same two-branch authorization as today (the query runs only after authorization).
- [ ] 1.2 Poller. Extend `runSnapshotSchema` in `src/components/runs/run-status-poller.tsx` with `events` and `executedOn`, `usage` (optional). Render a new `RunTimeline` component (`src/components/runs/run-timeline.tsx`, CSS module beside it) under the status line: ordered list, one row per event, label from the shared label module, relative time. Show `t("executedOn.agentcore")` or `t("executedOn.local")` when present, and `t("usage", { tokens, tools })` when present.
- [ ] 1.3 Labels. Move `activityKind` from `src/app/[locale]/(host)/page.tsx:605-617` into `src/components/host/activity-labels.ts` as `activityKindLabelKey`, and add the three missing tools `prepare_room_action`, `list_guest_rooms`, `find_room_options` to `TOOL_LABELS` with `Host.activityTools.{prepareRoomAction,listGuestRooms,findRoomOptions}` keys in both message files.
- [ ] 1.4 i18n. Add `Runs.timeline.{title,empty,executedOn.agentcore,executedOn.local,usage}` in `messages/en.json` and `messages/es.json`; reuse `Host.activityTools` and `Host.activityPolicies` for row labels through a shared translation hook.
- [ ] 1.5 Summary rendering. `localizedSummary` strips `**` markdown emphasis before display (the live Bedrock summary printed `**Invitation structured:**` verbatim on 2026-09-03).
- [ ] 1.6 Playwright. Extend the existing run-status journey to assert at least one `[data-testid="run-timeline-event"]` after a completed capture and that the guest-token branch sees events for its own run only.

## Pseudocode

```ts
// run-timeline.tsx
<ol data-testid="run-timeline">
  {events.map(e => <li data-testid="run-timeline-event" data-kind={e.kind}>
     <time>{formatHouseholdDateTime(e.at, locale, timeZone)}</time>
     <span>{labelFor(e, t)}</span>
  </li>)}
</ol>
```

## Tests

- `src/app/api/runs/run-data.test.ts` (integration, local Supabase): events ordered, scoped to the run, empty for a run with no audit rows, invisible under a foreign guest token.
- `src/components/runs/run-timeline.test.tsx`: all ten tool names produce a non-"other" label; policy verdict labels; empty state.
- `src/components/host/activity-labels.test.ts`: kind mapping moved intact.

## Done when

- [ ] Status page shows the timeline for a completed run in both locales.
- [ ] Capture panel poller shows the same rows inline.
- [ ] `pnpm run test:e2e` green; PR open; CI green.
