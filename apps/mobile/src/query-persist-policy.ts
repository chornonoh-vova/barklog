import { hashKey, type QueryClient, type QueryStatus } from "@tanstack/react-query";
import type { AsyncStorage, Persister } from "@tanstack/react-query-persist-client";

import { keys } from "@/api/keys";

export const PERSIST_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

export const PERSIST_PREFIX = "barklog-query-cache:";

/** What Home needs to render instantly; everything else is cheap to refetch. */
const PERSISTED_KEYS = [keys.backlog.list()];
const PERSISTED_HASHES = new Set(PERSISTED_KEYS.map((key) => hashKey(key)));

/** Per user, so one account's cache can never rehydrate into another's. */
export function persistKey(userId: string): string {
  return `${PERSIST_PREFIX}${userId}`;
}

/** Every saved cache but the current user's — clearing runs alongside their
 * restore, so theirs must survive it. */
export function staleCacheKeys(allKeys: readonly string[], userId: string | null): string[] {
  const own = userId === null ? null : persistKey(userId);

  return allKeys.filter((key) => key.startsWith(PERSIST_PREFIX) && key !== own);
}

export function shouldPersistQuery(queryKey: readonly unknown[], status: QueryStatus): boolean {
  return status === "success" && PERSISTED_HASHES.has(hashKey(queryKey));
}

/** Restored queries sit unobserved until Home mounts them; the default gcTime
 * would collect them, and drop them from disk on the next save. */
export function retainPersistedQueries(queryClient: QueryClient): void {
  for (const key of PERSISTED_KEYS) queryClient.setQueryDefaults(key, { gcTime: PERSIST_MAX_AGE });
}

/**
 * Restored data is a starting point, never fresh. Only what came from disk, though:
 * Home's first fetch starts before the disk read ends, so a list updated after
 * `startedAt` is already newer, and one still in flight is left to finish
 * rather than cancelled and asked again.
 */
export function revalidateRestored(queryClient: QueryClient, startedAt: number): Promise<void> {
  return queryClient.invalidateQueries(
    { queryKey: keys.backlog.all, predicate: (query) => query.state.dataUpdatedAt < startedAt },
    { cancelRefetch: false },
  );
}

/**
 * Stopping `persistQueryClient` does not cancel a restore already reading from
 * disk or a throttled save already queued; either can outlive a sign-out. After
 * `stop`, the restore yields nothing and storage takes no writes. Unchanged
 * values are not rewritten: every cache event triggers a save.
 */
export function guardPersistence(
  storage: AsyncStorage,
  createPersister: (storage: AsyncStorage) => Persister,
): { persister: Persister; stop: () => void } {
  let stopped = false;
  let lastWritten: string | undefined;
  const persister = createPersister({
    ...storage,
    setItem: async (key: string, value: string) => {
      if (stopped || value === lastWritten) return;

      lastWritten = value;
      await storage.setItem(key, value);
    },
    removeItem: async (key: string) => {
      lastWritten = undefined;
      await storage.removeItem(key);
    },
  });

  return {
    persister: {
      ...persister,
      restoreClient: async () => {
        const client = await persister.restoreClient();

        return stopped ? undefined : client;
      },
    },
    stop: () => {
      stopped = true;
    },
  };
}
