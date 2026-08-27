import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import {
  SEARCH_LIMIT_DEFAULT,
  SEARCH_QUERY_MIN,
  type BacklogEntryWire,
  type BacklogListResponse,
  type BacklogSort,
  type BacklogStatsWire,
  type BacklogStatus,
  type GameDetailResponse,
  type GameListResponse,
} from "@repo/contracts";
import { Alert } from "react-native";

import { errorCopy } from "./error-copy";
import { keys } from "./keys";
import { useApi } from "./provider";

/**
 * Reads have a full error path via `QueryBoundary`; writes have none — an
 * optimistic patch rolls back silently on failure with nothing telling the
 * user why. Same status-keyed copy as the read path, surfaced with a native
 * alert since a mutation has no screen real estate of its own to render into.
 */
function alertOnMutationError(error: unknown): void {
  const { title, description } = errorCopy(error);
  Alert.alert(title, description);
}

export function useBacklog(
  status: BacklogStatus | undefined,
  sort: BacklogSort = "updated_at",
): UseQueryResult<BacklogListResponse> {
  const api = useApi();

  return useQuery({
    queryKey: keys.backlog.list(status, sort),
    queryFn: () => api.listBacklog({ status, sort }),
  });
}

export function useBacklogStats(): UseQueryResult<BacklogStatsWire> {
  const api = useApi();

  return useQuery({ queryKey: keys.backlog.stats(), queryFn: () => api.getBacklogStats() });
}

export function usePopularGames(limit = SEARCH_LIMIT_DEFAULT): UseQueryResult<GameListResponse> {
  const api = useApi();

  return useQuery({
    queryKey: keys.games.popular(limit),
    queryFn: () => api.popularGames({ limit }),
  });
}

export function useSearchGames(
  q: string,
  limit = SEARCH_LIMIT_DEFAULT,
): UseQueryResult<GameListResponse> {
  const api = useApi();

  return useQuery({
    queryKey: keys.games.search(q, limit, 0),
    queryFn: () => api.searchGames({ q, limit }),
    // The API rejects a shorter query with a 422; not asking is better than
    // being told no.
    enabled: q.length >= SEARCH_QUERY_MIN,
    // Results stay on screen while the next keystroke's query resolves, so the
    // list does not blank between characters.
    placeholderData: keepPreviousData,
  });
}

export function useGame(id: number): UseQueryResult<GameDetailResponse> {
  const api = useApi();

  return useQuery({ queryKey: keys.games.detail(id), queryFn: () => api.getGame(id) });
}

/**
 * Both backlog writes are the same optimistic move: patch the cached game
 * detail, put it back if the request fails, then invalidate the game and the
 * whole backlog namespace on settle — which sweeps the list and the stats
 * together because they share a first key element. Only the request itself and
 * the entry it leaves behind differ, so those are the two parameters.
 */
function useBacklogEntryMutation<TInput>(
  gameId: number,
  options: {
    mutationFn: (input: TInput) => Promise<unknown>;
    entry: (previous: GameDetailResponse, input: TInput) => BacklogEntryWire | null;
  },
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: options.mutationFn,

    onMutate: async (input: TInput) => {
      const key = keys.games.detail(gameId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<GameDetailResponse>(key);

      if (previous) {
        queryClient.setQueryData<GameDetailResponse>(key, {
          ...previous,
          backlogEntry: options.entry(previous, input),
        });
      }

      return { previous };
    },

    onError: (error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(keys.games.detail(gameId), context.previous);
      }
      alertOnMutationError(error);
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: keys.games.detail(gameId) });
      void queryClient.invalidateQueries({ queryKey: keys.backlog.all });
    },
  });
}

/**
 * `PUT` is a full replace of a two-field resource, so the optimistic patch can
 * simply write the new entry — there is no partial state to merge.
 */
export function useUpsertBacklogEntry(gameId: number) {
  const api = useApi();

  return useBacklogEntryMutation(gameId, {
    mutationFn: (input: { status: BacklogStatus; rating: number | null }) =>
      api.upsertBacklogEntry(gameId, input),
    entry: (previous, input) => ({
      gameId,
      status: input.status,
      rating: input.rating,
      addedAt: previous.backlogEntry?.addedAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  });
}

export function useDeleteBacklogEntry(gameId: number) {
  const api = useApi();

  return useBacklogEntryMutation<void>(gameId, {
    mutationFn: () => api.deleteBacklogEntry(gameId),
    entry: () => null,
  });
}
