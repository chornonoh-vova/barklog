import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { keys } from "@/api/keys";
import { createQueryClient } from "@/query-client";
import { refreshEntitlement } from "@/purchases/refresh";

function seeded() {
  const queryClient = createQueryClient();
  queryClient.setQueryData(keys.me(), { id: "u1" });
  queryClient.setQueryData(keys.backlog.list(), []);
  return queryClient;
}

const isInvalidated = (queryClient: ReturnType<typeof seeded>, key: readonly unknown[]) =>
  queryClient.getQueryState(key)?.isInvalidated === true;

describe("refreshEntitlement", () => {
  beforeEach(() => {
    vi.stubGlobal("__DEV__", false);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("invalidates me only after the server has re-read", async () => {
    const queryClient = seeded();
    let release!: () => void;
    const refreshSubscription = vi.fn(
      () => new Promise<void>((resolve) => (release = resolve)),
    );

    const done = refreshEntitlement({ refreshSubscription } as never, queryClient);
    await Promise.resolve();
    expect(isInvalidated(queryClient, keys.me())).toBe(false);

    release();
    await done;
    expect(isInvalidated(queryClient, keys.me())).toBe(true);
  });

  it("invalidates me even when both refresh attempts fail", async () => {
    vi.useFakeTimers();
    const queryClient = seeded();
    const refreshSubscription = vi.fn().mockRejectedValue(new Error("down"));

    const done = refreshEntitlement({ refreshSubscription } as never, queryClient);
    await vi.advanceTimersByTimeAsync(2_000);
    await done;

    expect(refreshSubscription).toHaveBeenCalledTimes(2);
    expect(isInvalidated(queryClient, keys.me())).toBe(true);
  });

  it("leaves the backlog alone", async () => {
    const queryClient = seeded();
    const refreshSubscription = vi.fn().mockResolvedValue(undefined);

    await refreshEntitlement({ refreshSubscription } as never, queryClient);

    expect(isInvalidated(queryClient, keys.backlog.list())).toBe(false);
  });
});
