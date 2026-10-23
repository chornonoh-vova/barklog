import { QueryClient, QueryObserver } from "@tanstack/react-query";
import {
  persistQueryClient,
  type AsyncStorage,
  type PersistedClient,
  type Persister,
} from "@tanstack/react-query-persist-client";
import { describe, expect, it } from "vitest";

import { keys } from "@/api/keys";
import {
  guardPersistence,
  PERSIST_MAX_AGE,
  PERSIST_PREFIX,
  persistKey,
  retainPersistedQueries,
  revalidateRestored,
  staleCacheKeys,
  shouldPersistQuery,
} from "@/query-persist-policy";

const LIST = keys.backlog.list();

describe("persistKey", () => {
  // One user's cached backlog must never rehydrate into another's session.
  it("is per user, under a shared prefix", () => {
    expect(persistKey("user_a")).not.toBe(persistKey("user_b"));
    expect(persistKey("user_a").startsWith(PERSIST_PREFIX)).toBe(true);
  });
});

describe("shouldPersistQuery", () => {
  it("persists Home's list only", () => {
    expect(shouldPersistQuery(LIST, "success")).toBe(true);
    expect(shouldPersistQuery(["backlog", "stats"], "success")).toBe(false);
  });

  it("does not persist search, recents, or other queries", () => {
    expect(shouldPersistQuery(["games", "search", "x", 20, 0], "success")).toBe(false);
    expect(shouldPersistQuery(["recents"], "success")).toBe(false);
  });

  it("does not persist a failed or pending query", () => {
    expect(shouldPersistQuery(LIST, "error")).toBe(false);
    expect(shouldPersistQuery(LIST, "pending")).toBe(false);
  });
});

describe("retainPersistedQueries", () => {
  // Restored queries sit unobserved until Home mounts them; the default five
  // minutes would collect them, and drop them from disk on the next save.
  it("keeps persisted queries as long as they are persisted, and nothing else", () => {
    const client = new QueryClient();
    retainPersistedQueries(client);

    expect(client.getQueryDefaults(LIST).gcTime).toBe(PERSIST_MAX_AGE);
    expect(client.getQueryDefaults(["games", "detail", 1]).gcTime).toBe(undefined);
  });
});

function savedCache(): PersistedClient {
  const source = new QueryClient();
  source.setQueryData(LIST, { items: ["user A's game"] });

  return {
    timestamp: Date.now(),
    buster: "",
    clientState: {
      mutations: [],
      queries: [
        {
          queryKey: LIST,
          queryHash: JSON.stringify(LIST),
          state: source.getQueryState(LIST)!,
          dehydratedAt: Date.now(),
        },
      ],
    },
  };
}

function memoryStorage() {
  const writes: [string, string][] = [];
  const storage: AsyncStorage = {
    getItem: async () => null,
    setItem: async (key, value) => {
      writes.push([key, value]);
    },
    removeItem: async () => undefined,
  };

  return { storage, writes };
}

/** A persister whose restore resolves only when the test says so. */
function slowPersister() {
  let resolve: (client: PersistedClient) => void = () => undefined;
  const persister: Persister = {
    restoreClient: () => new Promise((r) => (resolve = r)),
    persistClient: async () => undefined,
    removeClient: async () => undefined,
  };

  return { persister, resolveRestore: (client: PersistedClient) => resolve(client) };
}

describe("guardPersistence", () => {
  // The user changed while their cache was still being read: it must not land
  // in the next session's cache, the widget, or the next user's saved cache.
  it("restores nothing once stopped, even if the read finishes later", async () => {
    const slow = slowPersister();
    const { persister, stop } = guardPersistence(memoryStorage().storage, () => slow.persister);
    const queryClient = new QueryClient();
    const [unsubscribe, restored] = persistQueryClient({ queryClient, persister });

    stop();
    unsubscribe();
    queryClient.clear();
    slow.resolveRestore(savedCache());
    await restored;

    expect(queryClient.getQueryData(LIST)).toBeUndefined();
  });

  it("restores normally while running", async () => {
    const slow = slowPersister();
    const { persister } = guardPersistence(memoryStorage().storage, () => slow.persister);
    const queryClient = new QueryClient();
    const [unsubscribe, restored] = persistQueryClient({ queryClient, persister });

    slow.resolveRestore(savedCache());
    await restored;
    unsubscribe();

    expect(queryClient.getQueryData(LIST)).toEqual({ items: ["user A's game"] });
  });

  // The persister throttles inside its own save, so a save queued before
  // sign-out reaches storage after `stop` unless the write itself is guarded.
  it("drops writes once stopped", async () => {
    const { storage, writes } = memoryStorage();
    let guarded: AsyncStorage | undefined;
    const { stop } = guardPersistence(storage, (s: AsyncStorage) => {
      guarded = s;
      return slowPersister().persister;
    });

    await guarded!.setItem("k", "before");
    stop();
    await guarded!.setItem("k", "after");

    expect(writes).toEqual([["k", "before"]]);
  });

  // Every cache event — search as you type included — triggers a save of the
  // same backlog; only a change should reach the disk.
  it("skips a write that would store the same value again", async () => {
    const { storage, writes } = memoryStorage();
    let guarded: AsyncStorage | undefined;
    guardPersistence(storage, (s: AsyncStorage) => {
      guarded = s;
      return slowPersister().persister;
    });

    await guarded!.setItem("k", "a");
    await guarded!.setItem("k", "a");
    await guarded!.setItem("k", "b");

    expect(writes).toEqual([
      ["k", "a"],
      ["k", "b"],
    ]);
  });
});

describe("staleCacheKeys", () => {
  const keys = [persistKey("user_a"), persistKey("user_b"), "barklog.onboarding.seen"];

  // Clearing runs alongside the next user's restore; their own cache must survive it.
  it("keeps the current user's cache and drops every other one", () => {
    expect(staleCacheKeys(keys, "user_b")).toEqual([persistKey("user_a")]);
  });

  it("drops every cache when signed out", () => {
    expect(staleCacheKeys(keys, null)).toEqual([persistKey("user_a"), persistKey("user_b")]);
  });
});

describe("guardPersistence after a removal", () => {
  // An expired or busted cache is removed by the restore; the next save, even
  // of the same value, must reach the disk again.
  it("writes the same value again once its key was removed", async () => {
    const { storage, writes } = memoryStorage();
    let guarded: AsyncStorage | undefined;
    guardPersistence(storage, (s: AsyncStorage) => {
      guarded = s;
      return slowPersister().persister;
    });

    await guarded!.setItem("k", "a");
    await guarded!.removeItem("k");
    await guarded!.setItem("k", "a");

    expect(writes).toEqual([
      ["k", "a"],
      ["k", "a"],
    ]);
  });
});

describe("revalidateRestored", () => {
  const STARTED_AT = 1_000_000;

  // Restored data is a starting point, never fresh.
  it("invalidates data restored from an earlier session", async () => {
    const client = new QueryClient();
    client.setQueryData(LIST, { items: [] }, { updatedAt: STARTED_AT - 1 });

    await revalidateRestored(client, STARTED_AT);

    expect(client.getQueryState(LIST)?.isInvalidated).toBe(true);
  });

  // A list Home already fetched over the network while the disk read ran is
  // newer than anything on disk; refetching it would be a second request.
  it("leaves data fetched this session alone", async () => {
    const client = new QueryClient();
    client.setQueryData(LIST, { items: [] }, { updatedAt: STARTED_AT + 1 });

    await revalidateRestored(client, STARTED_AT);

    expect(client.getQueryState(LIST)?.isInvalidated).toBe(false);
  });

  // Home's first fetch starts before the restore lands; cancelling it and
  // asking again throws a response away on every launch.
  it("does not cancel and repeat a fetch already in flight", async () => {
    const client = new QueryClient();
    client.setQueryData(LIST, { items: [] }, { updatedAt: STARTED_AT - 1 });
    let calls = 0;
    let aborted = false;
    let resolve!: (value: { items: never[] }) => void;
    const observer = new QueryObserver(client, {
      queryKey: LIST,
      staleTime: 0,
      queryFn: ({ signal }) => {
        calls += 1;
        signal.addEventListener("abort", () => {
          aborted = true;
        });
        return new Promise((res) => {
          resolve = res;
        });
      },
    });
    const unsubscribe = observer.subscribe(() => undefined);
    expect(calls).toBe(1);

    const revalidated = revalidateRestored(client, STARTED_AT);
    resolve({ items: [] });
    await revalidated;

    expect(calls).toBe(1);
    expect(aborted).toBe(false);
    unsubscribe();
  });
});
