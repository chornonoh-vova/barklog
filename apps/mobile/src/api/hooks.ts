import {
  keepPreviousData,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import {
  SEARCH_LIMIT_DEFAULT,
  SEARCH_QUERY_MIN,
  SIMILAR_LIMIT_DEFAULT,
  type BacklogListResponse,
  type BacklogStatus,
  type GameDetailResponse,
  type GameFeed,
  type GameListResponse,
  type MeResponse,
  type ShareIdentifyResponse,
} from "@repo/contracts";
import { notificationAsync, NotificationFeedbackType } from "expo-haptics";
import { router } from "expo-router";
import { useMemo } from "react";
import { Alert } from "react-native";

import { createEntryWrites, type EntryWriteEffects } from "@/features/backlog/entry-writes";

import { errorCopy } from "./error-copy";
import { keys } from "./keys";
import { useApi } from "./provider";

function alertOnMutationError(error: unknown): void {
  const { title, description } = errorCopy(error);
  Alert.alert(title, description);
}

/** The whole backlog: Home filters it on the device, so a filter switch
 * never fetches. */
export function useBacklog(): UseQueryResult<BacklogListResponse> {
  const api = useApi();

  return useQuery({ queryKey: keys.backlog.list(), queryFn: () => api.listBacklog() });
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

const ENTRY_WRITE_EFFECTS: EntryWriteEffects = {
  openPaywall: () => router.push("/paywall"),
  alertError: alertOnMutationError,
  playStatusHaptic: () => void notificationAsync(NotificationFeedbackType.Success),
};

/** Backlog entry writes for one game; see `createEntryWrites`. */
export function useBacklogEntry(gameId: number): {
  move: (status: BacklogStatus) => void;
  rate: (status: BacklogStatus, rating: number | null) => void;
  remove: () => void;
} {
  const queryClient = useQueryClient();
  const api = useApi();
  const writes = useMemo(
    () => createEntryWrites(queryClient, api, ENTRY_WRITE_EFFECTS),
    [queryClient, api],
  );

  return useMemo(
    () => ({
      move: (status) => void writes.move(gameId, status),
      rate: (status, rating) => void writes.rate(gameId, status, rating),
      remove: () => void writes.remove(gameId),
    }),
    [writes, gameId],
  );
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
