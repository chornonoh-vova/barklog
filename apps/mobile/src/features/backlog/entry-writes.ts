import type {
  BacklogEntryWire,
  BacklogListResponse,
  BacklogStatus,
  GameDetailResponse,
  MeResponse,
} from "@repo/contracts";
import { MutationObserver, type QueryClient } from "@tanstack/react-query";

import type { Endpoints } from "@/lib/api/endpoints";
import { isApiError } from "@/lib/api/errors";
import { keys } from "@/lib/api/keys";
import { activeSlotsUsed } from "@/features/backlog/slots";
import { shouldPlayStatusHaptic } from "@/features/backlog/status-haptic";
import { wouldExceedSlots } from "@/features/paywall/should-offer-paywall";

/** The device side of a write: injected, so a test drives the core with fakes. */
export interface EntryWriteEffects {
  openPaywall(): void;
  alertError(error: unknown): void;
  playStatusHaptic(): void;
}

/** Each promise settles once the write has, and never rejects: a failure is
 * already handled by the alert or paywall. */
export interface EntryWrites {
  move(gameId: number, status: BacklogStatus): Promise<void>;
  rate(gameId: number, status: BacklogStatus, rating: number | null): Promise<void>;
  remove(gameId: number): Promise<void>;
}

/**
 * Writes are not applied to the cache ahead of the server: each one refetches
 * the game and the backlog once it lands, and the screens show what comes back.
 * A guess would need a snapshot and a rollback for every way it can be wrong.
 */
export function createEntryWrites(
  queryClient: QueryClient,
  api: Pick<Endpoints, "upsertBacklogEntry" | "deleteBacklogEntry">,
  effects: EntryWriteEffects,
): EntryWrites {
  const getList = () => queryClient.getQueryData<BacklogListResponse>(keys.backlog.list());

  /** The detail's entry when the detail is cached, else the list's; `undefined`
   * when neither knows the game. */
  const cachedEntry = (gameId: number): BacklogEntryWire | null | undefined => {
    const detail = queryClient.getQueryData<GameDetailResponse>(keys.games.detail(gameId));
    if (detail !== undefined) return detail.backlogEntry;

    return getList()?.items.find((item) => item.gameId === gameId);
  };

  // Cached data only, no fetch: a missing `me` or list lets the write through,
  // and the server's 402 is the backstop.
  const exceedsSlots = (gameId: number, to: BacklogStatus): boolean => {
    const list = getList();

    return wouldExceedSlots({
      premium: queryClient.getQueryData<MeResponse>(keys.me())?.premium,
      activeCount: list === undefined ? undefined : activeSlotsUsed(list.items),
      from: cachedEntry(gameId)?.status ?? null,
      to,
    });
  };

  // An observer rather than `mutationCache.build`, so the write gets the
  // client's mutation defaults and network mode, the same as `useMutation`.
  const write = (
    gameId: number,
    request: () => Promise<unknown>,
    status: BacklogStatus | null,
  ): Promise<void> => {
    // Read at tap time: the refetch after the write replaces it.
    const from = cachedEntry(gameId)?.status;
    const observer = new MutationObserver(queryClient, {
      mutationFn: request,

      onSuccess: () => {
        if (status !== null && shouldPlayStatusHaptic(from, status)) effects.playStatusHaptic();
      },

      onError: (error) => {
        // No Alert: a sheet plus an alert is two dismissals for one event.
        if (isApiError(error) && error.status === 402) {
          // The slot check let this through, so the cached entitlement or
          // count was wrong; refetch `me` before the next tap.
          void queryClient.invalidateQueries({ queryKey: keys.me() });
          effects.openPaywall();
          return;
        }

        effects.alertError(error);
      },

      onSettled: () => {
        void queryClient.invalidateQueries({ queryKey: keys.games.detail(gameId) });
        void queryClient.invalidateQueries({ queryKey: keys.backlog.all });
      },
    });

    // Reset once settled: an attached observer keeps the mutation out of the
    // cache's gc for the session.
    return observer.mutate().then(
      () => observer.reset(),
      () => observer.reset(),
    );
  };

  return {
    move: async (gameId, status) => {
      if (exceedsSlots(gameId, status)) {
        effects.openPaywall();
        return;
      }

      // `rating` left out, so the server keeps the stored one.
      await write(gameId, () => api.upsertBacklogEntry(gameId, { status }), status);
    },

    rate: async (gameId, status, rating) => {
      if (exceedsSlots(gameId, status)) {
        effects.openPaywall();
        return;
      }

      await write(gameId, () => api.upsertBacklogEntry(gameId, { status, rating }), status);
    },

    remove: (gameId) => write(gameId, () => api.deleteBacklogEntry(gameId), null),
  };
}
