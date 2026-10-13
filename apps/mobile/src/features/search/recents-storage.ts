import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery, type QueryClient } from "@tanstack/react-query";

import { keys } from "@/api/keys";
import { parseRecents, pushRecent } from "@/features/search/recents";

const KEY = "search.recents";
const EMPTY: readonly string[] = [];

/** Disk writes in call order, and reads behind them, so a read that follows a
 * clear can never bring the cleared list back. */
let writes: Promise<void> = Promise.resolve();

function persist(op: () => Promise<void>): void {
  writes = writes.then(op).catch(() => {
    // Ignored: see below.
  });
}

/**
 * A query with no backend: the cache is the one in-memory owner, shared by the
 * Search route and `AuthGate`. AsyncStorage like `storage/flag.ts`: an
 * uninstall clears it. Failures are swallowed — losing a recent search is not
 * worth an error.
 */
const recentsQuery = {
  queryKey: keys.recents(),
  queryFn: () => writes.then(() => AsyncStorage.getItem(KEY)).then(parseRecents, () => []),
  staleTime: Infinity,
};

export function useRecents(): readonly string[] {
  return useQuery(recentsQuery).data ?? EMPTY;
}

/** Waits for the stored list, so a search made before it loads adds to it
 * rather than overwriting it. */
export function recordRecent(queryClient: QueryClient, query: string): void {
  void queryClient.ensureQueryData(recentsQuery).then((stored) => {
    const next = pushRecent(queryClient.getQueryData(recentsQuery.queryKey) ?? stored, query);
    queryClient.setQueryData(recentsQuery.queryKey, next);
    persist(() => AsyncStorage.setItem(KEY, JSON.stringify(next)));
  });
}

/**
 * Through `setQueryData`, not only the disk: an account switch keeps the
 * Search route mounted, and `queryClient.clear()` drops the query without
 * telling its observer — the last user's searches would stay on screen. Call
 * before `clear()`: the update re-renders Search, which re-reads storage behind
 * the removal queued here.
 */
export function clearRecents(queryClient: QueryClient): void {
  queryClient.setQueryData(recentsQuery.queryKey, []);
  persist(() => AsyncStorage.removeItem(KEY));
}
