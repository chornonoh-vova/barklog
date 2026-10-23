import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useSyncExternalStore } from "react";

import { parseRecents, pushRecent } from "@/features/search/recents";

const KEY = "search.recents";

/** Disk writes in call order, and reads behind them, so a read that follows a
 * clear can never bring the cleared list back. */
let writes: Promise<void> = Promise.resolve();

function persist(op: () => Promise<void>): void {
  writes = writes.then(op).catch(() => {
    // Ignored: see below.
  });
}

/**
 * Module state, not the query cache: the Search route and `AuthGate` share
 * one in-memory owner, and an account switch is just `clearRecents()` with no
 * ordering against `queryClient.clear()`. AsyncStorage like `storage/flag.ts`:
 * an uninstall clears it. Failures are swallowed — losing a recent search is
 * not worth an error.
 */
let list: readonly string[] = [];
/** Set once the list changed by hand, so a read still in flight cannot
 * overwrite it. */
let changed = false;
let loading: Promise<void> | undefined;
const listeners = new Set<() => void>();

function set(next: readonly string[]): void {
  list = next;
  changed = true;
  listeners.forEach((listener) => listener());
}

function load(): Promise<void> {
  loading ??= writes
    .then(() => AsyncStorage.getItem(KEY))
    .then(parseRecents, () => [])
    .then((stored) => {
      if (changed) return;
      list = stored;
      listeners.forEach((listener) => listener());
    });
  return loading;
}

export const recentsStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot: (): readonly string[] => list,
  load,
};

export function useRecents(): readonly string[] {
  useEffect(() => {
    void load();
  }, []);
  return useSyncExternalStore(recentsStore.subscribe, recentsStore.getSnapshot);
}

/** Waits for the stored list, so a search made before it loads adds to it
 * rather than overwriting it. */
export async function recordRecent(query: string): Promise<void> {
  await load();
  const next = pushRecent(list, query);
  set(next);
  persist(() => AsyncStorage.setItem(KEY, JSON.stringify(next)));
}

/** Synchronous for subscribers: an account switch keeps the Search route
 * mounted, so the last user's searches must leave the screen at once. */
export function clearRecents(): void {
  set([]);
  persist(() => AsyncStorage.removeItem(KEY));
}
