import { sqlClient, type DatabaseClient } from "./db/client";

export interface Clock {
  now(): Date;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export class FakeClock implements Clock {
  private currentTime: number;

  constructor(now: Date) {
    this.currentTime = validTime(now);
  }

  now(): Date {
    return new Date(this.currentTime);
  }

  set(now: Date): void {
    this.currentTime = validTime(now);
  }

  advance(milliseconds: number): void {
    if (!Number.isFinite(milliseconds)) {
      throw new RangeError("milliseconds must be finite");
    }
    this.currentTime += milliseconds;
  }
}

export interface DemoClockRecord {
  enabled: boolean;
  homeDemo: boolean;
  now: Date | string;
}

export interface DemoClockStore {
  read(homeId: string): Promise<DemoClockRecord | null>;
}

export type DemoClockSource = DemoClockStore | DatabaseClient;

/**
 * A request-scoped clock loaded from authoritative database state.
 * Call load again for a later request after the demo clock has moved.
 */
export class DbDemoClock implements Clock {
  private constructor(private readonly currentTime: Date) {}

  static async load(
    homeId: string,
    source: DemoClockSource,
    fallback: Clock = new SystemClock(),
  ): Promise<DbDemoClock> {
    const record = await readDemoClock(source, homeId);
    if (!record?.enabled || !record.homeDemo) {
      return new DbDemoClock(fallback.now());
    }

    return new DbDemoClock(new Date(validTime(new Date(record.now))));
  }

  now(): Date {
    return new Date(this.currentTime);
  }
}

async function readDemoClock(
  source: DemoClockSource,
  homeId: string,
): Promise<DemoClockRecord | null> {
  if (typeof source === "object" && "read" in source) {
    return source.read(homeId);
  }

  const client = sqlClient(source);
  const rows = await client<
    { enabled: boolean; home_demo: boolean; now: Date | string }[]
  >`
    select dc.enabled, h.demo as home_demo, dc.now
    from public.homes h
    left join public.demo_clock dc on dc.home_id = h.id
    where h.id = ${homeId}
      and dc.home_id is not null
    limit 1
  `;
  const row = rows[0];
  return row
    ? { enabled: row.enabled, homeDemo: row.home_demo, now: row.now }
    : null;
}

function validTime(date: Date): number {
  const time = date.getTime();
  if (!Number.isFinite(time))
    throw new RangeError("Clock time must be a valid Date");
  return time;
}
