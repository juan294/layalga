# Phase 3: Returning-guest memory through Strands MemoryManager and AgentCore Memory

Depends on: Phase 0 (runtime env), Phase 2 (shares `env.ts`, host page, messages).
Branch: `feat/household-memory`.

## Goal

The coordinator remembers each family's preferences across invitations (arrival habits, room needs, pets, accessibility) through Strands `MemoryManager` backed by AgentCore Memory. A host can see and erase what is remembered per family. A guest task can only recall its own party. No family name is written to memory or sent to the provider.

## Design (VERIFIED constraints in plan section 3)

- **Resource.** One memory `LayalgaHouseholdMemory` in `us-east-1`, `eventExpiryDuration 30`, strategies: `userPreferenceMemoryStrategy HouseholdPreferences` with template `/parties/{actorId}/preferences`, `semanticMemoryStrategy HouseholdFacts` with template `/parties/{actorId}/facts`. Created once by `scripts/create-memory.sh`; id stored as `MEMORY_ID` in Vercel production and the AgentCore runtime env.
- **Actor id.** `home-<homeId>/party-<partyId>` (matches the actorId pattern with `/`). Resolved read namespaces: host tasks read `namespacePath: /parties/home-<homeId>` (whole home, hosts may see every party); guest tasks read `namespacePath: /parties/home-<homeId>/party-<partyId>` (own party only). Session id for events: the existing Strands session id (`inv_<uuid>`, `capture_<uuid>`), which matches the `[a-zA-Z0-9][a-zA-Z0-9-_]*` pattern.
- **Authority.** Add `partyId?: string` to `AgentAuthority` (`src/agent/ports.ts`) and resolve it in `authorityForTask` for `guest_submit`, `guest_change`, `guest_reconfirm`, and `resume` on `inv_*` sessions (join invitation to party). `host_capture` gets `partyId` only when a deterministic pre-match finds an existing party of the home whose `family_name` appears case- and diacritic-insensitively in the raw message.
- **Stores.** `src/agent/memory.ts` builds `MemoryManager` config per task: `injection: false` (D6), `searchToolConfig: { description: "Search what the household remembers about this family: arrival habits, room needs, pets, accessibility." }`, `addToolConfig: false`. Guest tasks: one `AgentCoreMemoryStore` per party subtree, `writable: true`, `extraction: { trigger: new InvocationTrigger() }`. Host capture with a matched party: same store for that party. Host capture without a match and `host_room_request`: no stores (room requests must not reintroduce names). `tick` and `resume`: read-only store for the party, no extraction. `runAgentTask` calls `await memoryManager.flush()` after `agent.invoke` returns.
- **Names out of memory (D7).** Rewrite the `guest_submit`, `guest_change`, and `host_capture` prompts in `src/agent/run-task.ts:872-923` to omit the family name (the minimizer removed it before the provider anyway) so extraction never sees it. Keep the minimizer for the tick prompts. The system prompt already forbids revealing another party's name.
- **Deterministic capture write.** After a completed `host_capture` that created or reused a party, `recordCaptureMemory` sends one `CreateEvent` with a USER turn: the invitation facts without the name (party size, dates text, arrival time, special requests, pets) so the first invitation seeds memory even when no pre-match existed. Uses `@aws-sdk/client-bedrock-agentcore` directly with `clientToken = run.id`.
- **Host panel.** "What L'Ayalga remembers" section on the host page: for each party of the home with at least one invitation, `ListMemoryRecords` with `namespacePath`; show record content and created date; a Forget button calls `forgetPartyMemory(homeId, partyId)`: paginate `ListMemoryRecords` and `BatchDeleteMemoryRecords` (100 per call), then `ListSessions`, `ListEvents`, `DeleteEvent`; write `audit_events` kind `memory_forgotten` with actor `host`. The panel is read from the web runtime with the `layalga-web` credentials.
- **IAM.** `infra/iam/memory-data-plane.json`: the eleven data-plane actions on `arn:aws:bedrock-agentcore:us-east-1:106403001709:memory/<MEMORY_ID>`, attached to `layalga-web` and inline on `layalga-agentcore-runtime`. Prefix is `bedrock-agentcore:` for both planes.
- **Env.** `MEMORY=none|agentcore` (non-production default `none`), `MEMORY_ID`; readiness mirrors.
- **Demo seed.** `scripts/seed-memory.ts` writes three events for the seeded Vega party (`00000000-0000-4000-8000-000000000301`): "prefer the ground floor room", "usually arrive late on Friday evenings", "one small dog". Party ids are stable across `resetDemoHome`, so memory survives demo resets. The video shows recall on a second Vega invitation captured through the host form; the run summary and the timeline row `search_memory` make it visible.
- **Retention.** `docs/security/data-lifecycle.md`: memory records expire with the resource's 30-day event expiry for events; long-term records persist until Forget; demo home records are erased by `scripts/seed-memory.ts --forget` before each recording.

## Tasks

- [ ] 3.1 `partyId` in `AgentAuthority`, resolved in `authorityForTask`; tests in `src/agent/tenant-scope.test.ts` for cross-home party rejection.
- [ ] 3.2 Prompt rewrite without family names; extend `src/agent/prompt-minimization.test.ts` to assert the new prompts are unchanged by the minimizer.
- [ ] 3.3 `src/agent/memory.ts` (`memoryConfigForTask`, `createMemoryStores`), wired in `buildAgent` (`src/agent/agent.ts:26-49`) through a new `memoryManager` option and `flush()` in `runAgentTask`.
- [ ] 3.4 `recordCaptureMemory` after `host_capture` completion; audit `memory_written` with actor `agent` (no content in payload).
- [ ] 3.5 `src/core/memory/client.ts` (list, batch delete, forget) and `src/core/memory/forget.ts`; host panel component `src/components/host/memory-panel.tsx`; Server Action `forgetPartyMemoryAction`; i18n `Host.memory.*`.
- [ ] 3.6 Prompts: host capture asks the model to call `search_memory` first when a party matched; guest submit asks it to search before choosing options.
- [ ] 3.7 AWS: `scripts/create-memory.sh` (create, poll `ACTIVE`, print id), IAM policies applied, `MEMORY=agentcore` and `MEMORY_ID` in Vercel production and in `.env.agentcore`; redeploy runtime through `scripts/deploy-agentcore.sh`.
- [ ] 3.8 `scripts/seed-memory.ts` with `--forget`; wait loop that polls `ListMemoryRecords` until at least one record exists (prints elapsed time).
- [ ] 3.9 Demo driver and probes: memory is optional (`MEMORY=none` in CI); when `--expect-memory` is given, probe 2 asserts a `search_memory` tool_call audit row on the capture run.

## Pseudocode

```ts
// src/agent/memory.ts
export function memoryStoresForTask(task, authority, config): AgentCoreMemoryStore[] {
  if (config.memory !== "agentcore") return [];
  if (task.task === "host_room_request") return [];
  const home = `home-${authority.homeId}`;
  if (!authority.partyId) {
    return task.task === "host_capture"
      ? [new AgentCoreMemoryStore({ memoryId, actorId: home, sessionId, namespacePath: `/parties/${home}`, writable: false, name: "household" })]
      : [];
  }
  const actorId = `${home}/party-${authority.partyId}`;
  const writable = task.task === "guest_submit" || task.task === "guest_change" || task.task === "host_capture";
  return [new AgentCoreMemoryStore({ memoryId, actorId, sessionId, namespacePath: `/parties/${actorId}`, name: "family",
           writable, extraction: writable ? { trigger: new InvocationTrigger() } : false, maxSearchResults: 5 })];
}
```

## Tests

- `src/agent/memory.test.ts`: store topology per task (A7); no writable store for host room requests; namespaces concrete (no braces).
- `src/core/memory/forget.test.ts` with a fake client: pagination, batch chunks of 100, event sweep, audit row (A9).
- `src/agent/tenant-scope.test.ts`: a guest task for party A never receives a store for party B.
- Integration with a recorded fake: `search_memory` tool appears in the capture run tools when a party matched.

## Done when

- [ ] Memory resource `ACTIVE`; IAM applied; runtime redeployed with `MEMORY_ID`.
- [ ] Seeded Vega memory recalled on a new Vega invitation on production (M4); host panel lists and forgets it.
- [ ] PR open; CI green with `MEMORY=none`.
