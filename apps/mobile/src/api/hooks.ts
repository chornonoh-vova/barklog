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
  type MeResponse,
  type ShareIdentifyResponse,
} from "@repo/contracts";
import { router } from "expo-router";
import { Alert } from "react-native";

import { errorCopy } from "./error-copy";
import { isApiError } from "./errors";
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

export function useIdentifyShare(url: string | null): UseQueryResult<ShareIdentifyResponse> {
  const api = useApi();

  return useQuery({
    // `??` and `enabled` together: the key must be stable, and the query must
    // not run before a payload has resolved.
    queryKey: keys.games.identify(url ?? ""),
    queryFn: () => api.identifyShare({ url: url ?? "" }),
    enabled: url !== null,
    // The server's answer for a given video is immutable for the life of its
    // cache, and the `identify` rate limit is 10/min, so a refetch on focus
    // would spend a request to learn nothing.
    staleTime: Infinity,
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

      // No Alert: a sheet plus an alert is two dismissals for one event.
      if (isApiError(error) && error.status === 402) {
        router.push("/paywall");
        return;
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

export function useMe(): UseQueryResult<MeResponse> {
  const api = useApi();

  return useQuery({ queryKey: keys.me(), queryFn: () => api.getMe() });
}

/**
 * From the API, not `customerInfo`: the UI must agree with the enforcer.
 * `undefined` is "not known yet", and it stays that way for the life of a
 * screen if `/me` 4xxs — `query-client.ts` never retries those, so one 401
 * during a Clerk token refresh is enough. A gating decision must therefore
 * carry the unknown through rather than collapse it; see `wouldExceedSlots`.
 */
export function usePremium(): boolean | undefined {
  return useMe().data?.premium;
}

/** Display only — an unknown entitlement shows the free-tier hint, which is
 * wrong on screen but never refuses an action. Gating uses `usePremium`. */
export function useIsPremium(): boolean {
  return usePremium() ?? false;
}
