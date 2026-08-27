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

import { keys } from "./keys";
import { useApi } from "./provider";

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
 * `PUT` is a full replace of a two-field resource, so the optimistic patch can
 * simply write the new entry — there is no partial state to merge. The whole
 * backlog namespace is invalidated on settle, which sweeps the list and the
 * stats together because they share a first key element.
 */
export function useUpsertBacklogEntry(gameId: number) {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { status: BacklogStatus; rating: number | null }) =>
      api.upsertBacklogEntry(gameId, input),

    onMutate: async (input) => {
      const key = keys.games.detail(gameId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<GameDetailResponse>(key);

      if (previous) {
        const entry: BacklogEntryWire = {
          gameId,
          status: input.status,
          rating: input.rating,
          addedAt: previous.backlogEntry?.addedAt ?? new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        queryClient.setQueryData<GameDetailResponse>(key, { ...previous, backlogEntry: entry });
      }

      return { previous };
    },

    onError: (_error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(keys.games.detail(gameId), context.previous);
      }
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: keys.games.detail(gameId) });
      void queryClient.invalidateQueries({ queryKey: keys.backlog.all });
    },
  });
}

export function useDeleteBacklogEntry(gameId: number) {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.deleteBacklogEntry(gameId),

    onMutate: async () => {
      const key = keys.games.detail(gameId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<GameDetailResponse>(key);

      if (previous) {
        queryClient.setQueryData<GameDetailResponse>(key, { ...previous, backlogEntry: null });
      }

      return { previous };
    },

    onError: (_error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(keys.games.detail(gameId), context.previous);
      }
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: keys.games.detail(gameId) });
      void queryClient.invalidateQueries({ queryKey: keys.backlog.all });
    },
  });
}
