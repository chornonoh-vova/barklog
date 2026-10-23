import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import type { QueryClient } from "@tanstack/react-query";
import { persistQueryClient } from "@tanstack/react-query-persist-client";
import Constants from "expo-constants";
import * as Updates from "expo-updates";

import {
  guardPersistence,
  PERSIST_MAX_AGE,
  persistKey,
  retainPersistedQueries,
  revalidateRestored,
  shouldPersistQuery,
  staleCacheKeys,
} from "./query-persist-policy";

// A cache from another build or OTA update may hold an older wire shape.
const BUSTER = `${Constants.expoConfig?.version ?? "0"}:${Updates.updateId ?? "embedded"}`;

/** Restores and keeps saving this user's cache; returns the stop. */
export function startPersistence(queryClient: QueryClient, userId: string): () => void {
  const startedAt = Date.now();
  retainPersistedQueries(queryClient);
  const { persister, stop } = guardPersistence(AsyncStorage, (storage) =>
    createAsyncStoragePersister({ storage, key: persistKey(userId) }),
  );
  const [unsubscribe, restored] = persistQueryClient({
    queryClient,
    persister,
    maxAge: PERSIST_MAX_AGE,
    buster: BUSTER,
    dehydrateOptions: {
      shouldDehydrateQuery: (query) => shouldPersistQuery(query.queryKey, query.state.status),
    },
  });
  // A corrupt cache is already removed by the restore; the app just fetches.
  restored.then(() => revalidateRestored(queryClient, startedAt)).catch(() => undefined);

  return () => {
    stop();
    unsubscribe();
  };
}

/** Every saved cache but `userId`'s: a session revoked while the app was
 * closed comes back with no user id to name. Never rejects. */
export async function clearPersistedCaches(userId: string | null): Promise<void> {
  try {
    await AsyncStorage.multiRemove(staleCacheKeys(await AsyncStorage.getAllKeys(), userId));
  } catch {
    // Best-effort: the per-user key still keeps other accounts out.
  }
}
