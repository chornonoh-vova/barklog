import { expect, test } from "vitest";

import { createThrottle } from "../src/throttle.js";

test("never runs more than `concurrency` tasks at once", async () => {
  const throttle = createThrottle({ concurrency: 4, minIntervalMs: 0 });
  let active = 0;
  let peak = 0;

  await Promise.all(
    Array.from({ length: 20 }, () =>
      throttle(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
      }),
    ),
  );

  expect(peak).toBeLessThanOrEqual(4);
});

test("spaces starts by at least minIntervalMs", async () => {
  const throttle = createThrottle({ concurrency: 4, minIntervalMs: 20 });
  const started = Date.now();

  await Promise.all(Array.from({ length: 8 }, () => throttle(async () => {})));

  expect(Date.now() - started).toBeGreaterThanOrEqual(130);
});

test("a rejecting task releases its slot", async () => {
  const throttle = createThrottle({ concurrency: 1, minIntervalMs: 0 });

  await expect(throttle(async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
  await expect(throttle(async () => "recovered")).resolves.toBe("recovered");
});
