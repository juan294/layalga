import {
  AfterToolCallEvent,
  InvocationTrigger,
  type Agent,
  type MemoryManagerConfig,
} from "@strands-agents/sdk";
import { AgentCoreMemoryStore } from "bedrock-agentcore/memory/strands";

import { parseServerEnvironment } from "@/lib/server/env";

import type { AgentAuthority, AgentDeps } from "./ports";
import { audit } from "./tools/shared";
import type { AgentTask } from "./task";

/** The subset of `ServerEnvironment` the memory topology depends on. */
export interface MemoryTaskConfig {
  memory: "none" | "agentcore";
  memoryId?: string;
  awsRegion?: string;
}

const SEARCH_MEMORY_DESCRIPTION =
  "Search what the household remembers about this family: arrival habits, room needs, pets, accessibility.";

/**
 * Builds the `MemoryStore`s a task should read and, where allowed, write.
 * D6/D7 and the tenant boundary in one place:
 *
 * - `MEMORY=none` or a `host_room_request` task never gets a store (room
 *   requests must not reintroduce a family name into memory).
 * - New and legacy captures have no recall. Returning captures use only the selected party.
 * - A party-scoped task reads (and, for `guest_submit` and `guest_change`,
 *   writes) only its own party's subtree
 *   (`/parties/home-<homeId>/party-<partyId>`), never another party's.
 *
 * Returning captures read the verified party namespace. Their host transcript
 * is excluded from extraction. The bounded capture event is recorded separately
 * for the party on the persisted invitation by `recordCaptureMemory`.
 */
export function memoryStoresForTask(
  task: AgentTask["task"],
  authority: AgentAuthority | undefined,
  sessionId: string,
  config: MemoryTaskConfig = parseServerEnvironment(),
): AgentCoreMemoryStore[] {
  if (config.memory !== "agentcore" || !config.memoryId) return [];
  if (task === "host_room_request" || task === "host_capture") return [];
  if (!authority?.homeId || !authority.partyId) return [];

  const memoryId = config.memoryId;
  const region = config.awsRegion;
  const home = `home-${authority.homeId}`;

  const actorId = `${home}/party-${authority.partyId}`;
  const writable = task === "guest_submit" || task === "guest_change";
  return [
    new AgentCoreMemoryStore({
      memoryId,
      region,
      actorId,
      sessionId,
      namespacePath: `/parties/${actorId}`,
      name: "family",
      writable,
      extraction: writable ? { trigger: new InvocationTrigger() } : false,
      maxSearchResults: 5,
    }),
  ];
}

/**
 * The `MemoryManager` config for a task, or `undefined` when no store
 * applies. `undefined` (rather than an empty-store config) matters:
 * `MemoryManager` throws when constructed with zero stores, and
 * `buildAgent` must skip the `memoryManager` option entirely so
 * `MEMORY=none` stays byte-identical to today's agent construction.
 *
 * Injection stays off (D6): recall is tool-driven only, through
 * `search_memory`, preserving the anchored prompt-minimization regexes.
 * `add_memory` stays off too — the only memory write path is extraction
 * from a writable store, or the deterministic `recordCaptureMemory` event.
 */
export function memoryConfigForTask(
  task: AgentTask["task"],
  authority: AgentAuthority | undefined,
  sessionId: string,
  config: MemoryTaskConfig = parseServerEnvironment(),
): MemoryManagerConfig | undefined {
  const stores = memoryStoresForTask(task, authority, sessionId, config);
  if (stores.length === 0) return undefined;
  return {
    stores,
    searchToolConfig: { description: SEARCH_MEMORY_DESCRIPTION },
    addToolConfig: false,
    injection: false,
  };
}

/**
 * Audits every successful `search_memory` call as a `tool_call` audit row,
 * the same way each of this app's own tools audits itself
 * (`src/agent/tools/shared.ts`). `search_memory` is provided by the SDK's
 * `MemoryManager`, not by one of this app's own tool modules, so it never
 * reaches `audit()` on its own; this hook is the one place that makes a
 * memory recall visible on the run timeline and to the release probe that
 * asserts it (`scripts/release-probes.ts`, `--expect-memory`). A no-op
 * when no memory store was attached to this task, since the tool then
 * never exists to be called.
 */
export function installMemorySearchAudit(agent: Agent, deps: AgentDeps): void {
  agent.addHook(AfterToolCallEvent, async (event) => {
    if (event.toolUse.name !== "search_memory" || event.error) return;
    const authority = deps.authority;
    if (!authority?.partyId) return;
    await audit(deps, authority.homeId, event, "tool_call", {
      name: "search_memory",
      partyId: authority.partyId,
    });
  });
}
