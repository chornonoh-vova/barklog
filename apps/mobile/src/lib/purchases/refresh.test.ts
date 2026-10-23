import { keys } from "@/lib/api/keys";
import { createQueryClient } from "@/lib/query/query-client";
import { refreshEntitlement } from "@/lib/purchases/refresh";

function seeded() {
  const queryClient = createQueryClient();
  queryClient.setQueryData(keys.me(), { id: "u1" });
  queryClient.setQueryData(keys.backlog.list(), []);
  return queryClient;
}

const isInvalidated = (queryClient: ReturnType<typeof seeded>, key: readonly unknown[]) =>
  queryClient.getQueryState(key)?.isInvalidated === true;

describe("refreshEntitlement", () => {
  // React Native types `__DEV__` as a constant, so a release build is
  // simulated by writing it through the global object.
  const dev = __DEV__;

  beforeEach(() => {
    Reflect.set(globalThis, "__DEV__", false);
  });

  afterEach(() => {
    jest.useRealTimers();
    Reflect.set(globalThis, "__DEV__", dev);
  });

  it("invalidates me only after the server has re-read", async () => {
    const queryClient = seeded();
    let release!: () => void;
    const refreshSubscription = jest.fn(() => new Promise<void>((resolve) => (release = resolve)));

    const done = refreshEntitlement({ refreshSubscription } as never, queryClient);
    await Promise.resolve();
    expect(isInvalidated(queryClient, keys.me())).toBe(false);

    release();
    await done;
    expect(isInvalidated(queryClient, keys.me())).toBe(true);
  });

  it("invalidates me even when both refresh attempts fail", async () => {
    jest.useFakeTimers();
    const queryClient = seeded();
    const refreshSubscription = jest.fn().mockRejectedValue(new Error("down"));

    const done = refreshEntitlement({ refreshSubscription } as never, queryClient);
    await jest.advanceTimersByTimeAsync(2_000);
    await done;

    expect(refreshSubscription).toHaveBeenCalledTimes(2);
    expect(isInvalidated(queryClient, keys.me())).toBe(true);
  });

  it("leaves the backlog alone", async () => {
    const queryClient = seeded();
    const refreshSubscription = jest.fn().mockResolvedValue(undefined);

    await refreshEntitlement({ refreshSubscription } as never, queryClient);

    expect(isInvalidated(queryClient, keys.backlog.list())).toBe(false);
  });
});
