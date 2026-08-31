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
  SIMILAR_LIMIT_DEFAULT,
  type BacklogEntryWire,
  type BacklogListResponse,
  type BacklogSort,
  type BacklogStatsWire,
  type BacklogStatus,
  type GameDetailResponse,
  type GameFeed,
  type GameListResponse,
} from "@repo/contracts";
import { Alert } from "react-native";

import { errorCopy } from "./error-copy";
import { keys } from "./keys";
import { useApi } from "./provider";

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

export function useGameFeed(
  feed: GameFeed,
  limit = SEARCH_LIMIT_DEFAULT,
): UseQueryResult<GameListResponse> {
  const api = useApi();

  return useQuery({
    queryKey: keys.games.feed(feed, limit),
    queryFn: () => api.gameFeed(feed, { limit }),
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
    enabled: q.length >= SEARCH_QUERY_MIN,
    placeholderData: keepPreviousData,
  });
}

export function useGame(id: number): UseQueryResult<GameDetailResponse> {
  const api = useApi();

  return useQuery({ queryKey: keys.games.detail(id), queryFn: () => api.getGame(id) });
}

export function useSimilarGames(
  id: number,
  limit = SIMILAR_LIMIT_DEFAULT,
): UseQueryResult<GameListResponse> {
  const api = useApi();

  return useQuery({
    queryKey: keys.games.similar(id, limit),
    queryFn: () => api.similarGames(id, { limit }),
  });
}

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
