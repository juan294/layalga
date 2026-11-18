import "server-only";
import type { RunStatus } from "@/app/api/runs/run-data";
import { getDatabaseConnection } from "@/core/db/client";

const PAGE_SIZE = 5;
type Creator = { id: string; homeId: string };
export type CaptureEntry = {
  id: string;
  status: RunStatus;
  started_at: Date;
  retryable: boolean;
};

// Keep drafts, parsed requests and bearer values out of dashboard and status props.
async function creatorCaptures(
  host: Creator,
  runId: string | null,
  page: number,
) {
  const sql = getDatabaseConnection().sql;
  return sql<CaptureEntry[]>`
    select r.id, r.status, r.started_at,
      (r.request_attempt_count < 3 and r.payload ? 'task') as retryable
    from public.runs r
    where r.home_id=${host.homeId} and r.session_id=${"capture_" + host.id}
      and r.task in ('host_capture','host_capture_v2')
      and (${runId}::uuid is null or r.id=${runId})
      and (r.payload='{}'::jsonb or (r.payload->>'task'=r.task
        and r.payload->>'homeId'=${host.homeId} and r.payload->>'hostId'=${host.id}))
    order by r.started_at desc, r.id desc
    limit ${runId ? 1 : PAGE_SIZE + 1} offset ${page * PAGE_SIZE}
  `;
}

export async function creatorCapture(host: Creator, runId: string) {
  return (await creatorCaptures(host, runId, 0))[0];
}

export async function captureHistory(host: Creator, value: string | undefined) {
  const input = Number(value);
  const page =
    Number.isSafeInteger(input) && input >= 0 && input <= 2_147_483_647
      ? input
      : 0;
  const rows = await creatorCaptures(host, null, page);
  return {
    page,
    more: rows.length > PAGE_SIZE,
    rows: rows.slice(0, PAGE_SIZE),
  };
}
