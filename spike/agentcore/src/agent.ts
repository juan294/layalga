import {
  Agent,
  BedrockModel,
  BeforeToolCallEvent,
  SessionManager,
  tool,
} from '@strands-agents/sdk';
import { z } from 'zod';

import { HostDecisionSchema, type HostDecision } from './contracts.js';
import type { Database } from './database.js';
import { PostgresStorage } from './postgres-storage.js';

const DEFAULT_MODEL_ID = 'us.anthropic.claude-sonnet-4-5-20250929-v1:0';

export function buildAgent(sessionId: string, sql: Database): Agent {
  const placeHold = tool({
    name: 'place_hold',
    description: 'Place one test hold with the exact label requested by the user.',
    inputSchema: z.object({
      label: z.string().min(1),
    }),
    callback: async ({ label }) => {
      const [hold] = await sql<{ id: string; label: string }[]>`
        insert into public.spike_holds (label)
        values (${label})
        returning id::text, label
      `;

      if (!hold) {
        throw new Error('The hold insert returned no row');
      }

      return hold;
    },
  });

  const sessionManager = new SessionManager({
    sessionId,
    storage: new PostgresStorage(sql, sessionId),
    saveLatestOn: 'message',
  });

  const agent = new Agent({
    id: 'layalga-spike',
    model: new BedrockModel({
      region: 'us-east-1',
      modelId: process.env.BEDROCK_MODEL_ID ?? DEFAULT_MODEL_ID,
    }),
    printer: false,
    sessionManager,
    systemPrompt:
      'You are a deterministic deployment spike. When asked to place a hold, call place_hold exactly once with the requested label. If the tool is declined, do not retry it. End the turn after the tool result.',
    toolExecutor: 'sequential',
    tools: [placeHold],
  });

  agent.addHook(BeforeToolCallEvent, (event) => {
    if (event.toolUse.name !== 'place_hold') {
      return;
    }

    const decision = HostDecisionSchema.parse(
      event.interrupt<HostDecision>({
        name: 'host_decision',
        reason: { input: event.toolUse.input },
      }),
    );

    if (!decision.approved) {
      event.cancel = `Declined by host ${decision.hostId}: ${decision.note ?? ''}`.trim();
    }
  });

  return agent;
}

export async function countHolds(sql: Database, label?: string): Promise<number> {
  const [row] = label
    ? await sql<{ count: string }[]>`
        select count(*)::text as count
        from public.spike_holds
        where label = ${label}
      `
    : await sql<{ count: string }[]>`
        select count(*)::text as count
        from public.spike_holds
      `;

  return Number(row?.count ?? 0);
}
