import { describe, expect, it } from "vitest";

import { shouldWaitForPayload } from "@/features/share/should-wait-for-payload";

const settled = {
  isResolving: false,
  sharedCount: 0,
  resolvedCount: 0,
  hasError: false,
  hasAttempted: false,
};

describe("shouldWaitForPayload", () => {
  it("waits on the first frame of a share, before resolution has started", () => {
    // `useIncomingShare` seeds `sharedPayloads` synchronously but only flips
    // `isResolving` from an effect, so this frame is the one that would
    // otherwise flash a terminal empty state.
    expect(shouldWaitForPayload({ ...settled, sharedCount: 1 })).toBe(true);
  });

  it("waits while resolution is running", () => {
    expect(shouldWaitForPayload({ ...settled, sharedCount: 1, isResolving: true })).toBe(true);
  });

  /** Pins the `isResolving` guard, which the case above does not: a second
   * share arriving while `/shared` is mounted batches an emptied resolved list
   * with `isResolving: true` when `hasAttempted` is already set, and without
   * the guard that frame settles on `NO_LINK`. */
  it("waits while re-resolving, even though a previous attempt already completed", () => {
    expect(
      shouldWaitForPayload({
        ...settled,
        sharedCount: 1,
        isResolving: true,
        hasAttempted: true,
        resolvedCount: 1,
      }),
    ).toBe(true);
  });

  it("stops waiting once payloads have resolved", () => {
    expect(shouldWaitForPayload({ ...settled, sharedCount: 1, resolvedCount: 1 })).toBe(false);
  });

  it("stops waiting when resolution recorded an error", () => {
    expect(shouldWaitForPayload({ ...settled, sharedCount: 1, hasError: true })).toBe(false);
  });

  it("stops waiting when an attempt completed and returned nothing", () => {
    expect(shouldWaitForPayload({ ...settled, sharedCount: 1, hasAttempted: true })).toBe(false);
  });

  it("never waits when no share arrived at all", () => {
    expect(shouldWaitForPayload(settled)).toBe(false);
    expect(shouldWaitForPayload({ ...settled, hasAttempted: true })).toBe(false);
  });
});
