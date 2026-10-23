import type {
  BacklogEntryWire,
  BacklogListResponse,
  BacklogStatus,
  GameDetailResponse,
  GameSummaryWire,
  MeResponse,
} from "@repo/contracts";
import { MutationObserver, type QueryClient } from "@tanstack/react-query";

import type { Endpoints } from "@/api/endpoints";
import { isApiError } from "@/api/errors";
import { keys } from "@/api/keys";
import { patchBacklogList } from "@/features/backlog/optimistic-list";
import { activeSlotsUsed } from "@/features/backlog/slots";
import { shouldPlayStatusHaptic } from "@/features/backlog/status-haptic";
import { wouldExceedSlots } from "@/features/paywall/should-offer-paywall";

/** The device side of a write: injected, so the core stays plain Node. */
export interface EntryWriteEffects {
  openPaywall(): void;
  alertError(error: unknown): void;
  playStatusHaptic(): void;
}

/** Each promise settles once the write has, and never rejects: a failure is
 * already handled by the rollback, alert or paywall. */
export interface EntryWrites {
  move(gameId: number, status: BacklogStatus): Promise<void>;
  rate(gameId: number, status: BacklogStatus, rating: number | null): Promise<void>;
  remove(gameId: number): Promise<void>;
}

/** What the entry becomes, in the detail and in cached lists; `null` removes it. */
type Change = { status: BacklogStatus; rating: number | null } | null;

/** The list's shape only: the list is persisted, and detail fields would bloat it. */
function toSummary(game: GameDetailResponse): GameSummaryWire {
  return {
    id: game.id,
    name: game.name,
    slug: game.slug,
    coverImageId: game.coverImageId,
    firstReleaseDate: game.firstReleaseDate,
    totalRating: game.totalRating,
    totalRatingCount: game.totalRatingCount,
  };
}

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
    change: () => Change,
  ): Promise<void> => {
    const observer = new MutationObserver(queryClient, {
      mutationFn: request,

      onMutate: async () => {
        const key = keys.games.detail(gameId);
        await Promise.all([
          queryClient.cancelQueries({ queryKey: key }),
          queryClient.cancelQueries({ queryKey: keys.backlog.list() }),
        ]);
        const previous = queryClient.getQueryData<GameDetailResponse>(key);
        const next = change();
        const now = new Date().toISOString();

        if (previous) {
          queryClient.setQueryData<GameDetailResponse>(key, {
            ...previous,
            backlogEntry:
              next === null
                ? null
                : {
                    gameId,
                    status: next.status,
                    rating: next.rating,
                    addedAt: previous.backlogEntry?.addedAt ?? now,
                    updatedAt: now,
                  },
          });
        }

        // The list too, or Home keeps showing the old row until the refetch
        // lands — a removal that seems not to have worked invites a second tap.
        // Its filters are derived from it, so they follow. An add from a game's
        // page joins it too: slots are counted from the list, so a second add
        // before the refetch must see the first.
        const list = getList();

        if (list !== undefined) {
          queryClient.setQueryData(
            keys.backlog.list(),
            patchBacklogList(list, gameId, next, now, previous && toSummary(previous)),
          );
        }

        // At apply time, not on success: the screen already shows the new status,
        // and a haptic that waits on the network lands after the change it marks.
        // A failure is corrected by the rollback and alert in `onError`.
        if (next !== null && shouldPlayStatusHaptic(previous?.backlogEntry?.status, next.status)) {
          effects.playStatusHaptic();
        }

        return { previous, list };
      },

      onError: (error, _input, context) => {
        if (context?.previous) {
          queryClient.setQueryData(keys.games.detail(gameId), context.previous);
        }

        if (context?.list) queryClient.setQueryData(keys.backlog.list(), context.list);

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

    // Reset once settled: an attached observer keeps the mutation, and its
    // `{ previous, list }` snapshot, out of the cache's gc for the session.
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

      // The request leaves `rating` out so the server keeps the stored one;
      // the cache shows that same rating meanwhile.
      await write(
        gameId,
        () => api.upsertBacklogEntry(gameId, { status }),
        () => ({ status, rating: cachedEntry(gameId)?.rating ?? null }),
      );
    },

    rate: async (gameId, status, rating) => {
      if (exceedsSlots(gameId, status)) {
        effects.openPaywall();
        return;
      }

      await write(
        gameId,
        () => api.upsertBacklogEntry(gameId, { status, rating }),
        () => ({ status, rating }),
      );
    },

    remove: (gameId) =>
      write(
        gameId,
        () => api.deleteBacklogEntry(gameId),
        () => null,
      ),
  };
}
