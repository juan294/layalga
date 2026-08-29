import {
  BedrockAgentCoreClient,
  InvokeAgentRuntimeCommand,
  StopRuntimeSessionCommand,
} from '@aws-sdk/client-bedrock-agentcore';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import { countHolds } from '../src/agent.js';
import type { RuntimeTask } from '../src/contracts.js';
import { createDatabase } from '../src/database.js';
import { requireEnv } from '../src/env.js';

const InterruptSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  reason: z.unknown().optional(),
  response: z.unknown().optional(),
  source: z.string().optional(),
});

const RuntimeResultSchema = z.object({
  stopReason: z.string(),
  interrupts: z.array(InterruptSchema),
  holdsAfter: z.number().int().nonnegative(),
});

const SnapshotSchema = z.object({
  data: z.object({
    interrupts: z.object({
      activated: z.boolean(),
    }),
  }),
});

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function assertion(name: string, condition: boolean): void {
  const status = condition ? 'PASS' : 'FAIL';
  console.log(`${status}: ${name}`);

  if (!condition) {
    throw new Error(name);
  }
}

async function main(): Promise<void> {
  process.env.AWS_PROFILE ??= 'archy';

  const region = process.env.AWS_REGION ?? 'us-east-1';
  const runtimeArn = requireEnv('AGENTCORE_RUNTIME_ARN');
  const client = new BedrockAgentCoreClient({ region });
  const sql = createDatabase();
  const sessionId = `spike_${randomUUID()}`;
  const protocolStartedAt = performance.now();

  const invoke = async (runtimeSessionId: string, task: RuntimeTask) => {
    const output = await client.send(
      new InvokeAgentRuntimeCommand({
        accept: 'application/json',
        agentRuntimeArn: runtimeArn,
        contentType: 'application/json',
        payload: encoder.encode(JSON.stringify(task)),
        runtimeSessionId,
      }),
    );

    if (!output.response) {
      throw new Error(`Runtime session ${runtimeSessionId} returned no response body`);
    }

    return RuntimeResultSchema.parse(JSON.parse(await output.response.transformToString()));
  };

  try {
    await sql`
      delete from public.spike_holds
      where label in ('ALPHA', 'BETA')
    `;

    const runtimeSession1 = randomUUID();
    const r1 = await invoke(runtimeSession1, {
      task: 'start',
      sessionId,
      prompt: 'Place a hold labelled ALPHA.',
    });

    assertion(
      'start interrupts once for host_decision',
      r1.stopReason === 'interrupt' &&
        r1.interrupts.length === 1 &&
        r1.interrupts[0]?.name === 'host_decision',
    );

    const [snapshotRow] = await sql<{ data: Uint8Array }[]>`
      select data
      from public.agent_sessions
      where session_id = ${sessionId}
        and key like '%/snapshot_latest.json'
      order by updated_at desc
      limit 1
    `;
    const snapshot = snapshotRow
      ? SnapshotSchema.parse(JSON.parse(decoder.decode(snapshotRow.data)))
      : null;

    assertion('snapshot_latest persisted the active interrupt', snapshot?.data.interrupts.activated === true);
    assertion('ALPHA did not execute before approval', (await countHolds(sql, 'ALPHA')) === 0);

    const stop = await client.send(
      new StopRuntimeSessionCommand({
        agentRuntimeArn: runtimeArn,
        runtimeSessionId: runtimeSession1,
      }),
    );
    assertion('first runtime session stopped explicitly', stop.statusCode === 200);

    const interruptId = r1.interrupts[0]?.id;
    if (!interruptId) {
      throw new Error('The start response did not include an interrupt ID');
    }

    const r2 = await invoke(randomUUID(), {
      task: 'resume',
      sessionId,
      responses: [
        {
          interruptId,
          response: { approved: true, hostId: 'spike' },
        },
      ],
    });

    assertion('approved resume reaches endTurn', r2.stopReason === 'endTurn');
    assertion('ALPHA executes exactly once after approval', (await countHolds(sql, 'ALPHA')) === 1);

    const declineSessionId = `${sessionId}_b`;
    const r3 = await invoke(randomUUID(), {
      task: 'start',
      sessionId: declineSessionId,
      prompt: 'Place a hold labelled BETA.',
    });
    assertion(
      'decline case interrupts once for host_decision',
      r3.stopReason === 'interrupt' &&
        r3.interrupts.length === 1 &&
        r3.interrupts[0]?.name === 'host_decision',
    );

    const declineInterruptId = r3.interrupts[0]?.id;
    if (!declineInterruptId) {
      throw new Error('The decline start response did not include an interrupt ID');
    }

    const r4 = await invoke(randomUUID(), {
      task: 'resume',
      sessionId: declineSessionId,
      responses: [
        {
          interruptId: declineInterruptId,
          response: { approved: false, hostId: 'spike', note: 'no' },
        },
      ],
    });

    assertion('declined resume reaches endTurn', r4.stopReason === 'endTurn');
    assertion('BETA never executes after decline', (await countHolds(sql, 'BETA')) === 0);
    assertion('four runtime invocations finish within three minutes', performance.now() - protocolStartedAt < 180_000);
  } finally {
    await sql.end();
    client.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(`FAIL: spike protocol: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
