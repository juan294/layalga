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

function validTime(date: Date): number {
  const time = date.getTime();
  if (!Number.isFinite(time))
    throw new RangeError("Clock time must be a valid Date");
  return time;
}
