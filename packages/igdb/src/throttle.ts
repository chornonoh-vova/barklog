export interface ThrottleOptions {
  concurrency: number;
  minIntervalMs: number;
}

/** IGDB permits 4 requests per second, at most 8 open at once. */
export function createThrottle(options: ThrottleOptions) {
  const waiting: Array<() => void> = [];
  let active = 0;
  let nextSlotAt = 0;

  return async function run<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= options.concurrency) {
      await new Promise<void>((resolve) => waiting.push(resolve));
    }
    active += 1;

    const now = Date.now();
    const startAt = Math.max(now, nextSlotAt);
    nextSlotAt = startAt + options.minIntervalMs;

    if (startAt > now) {
      await new Promise((resolve) => setTimeout(resolve, startAt - now));
    }

    try {
      return await fn();
    } finally {
      active -= 1;
      waiting.shift()?.();
    }
  };
}
