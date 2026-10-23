import {
  IDENTIFY_LIMIT_DEFAULT,
  SEARCH_LIMIT_DEFAULT,
  SIMILAR_LIMIT_DEFAULT,
  type BacklogEntryWire,
  type BacklogListResponse,
  type BacklogStatus,
  type GameDetailResponse,
  type GameFeed,
  type GameListResponse,
  type MeResponse,
  type ShareIdentifyResponse,
} from "@repo/contracts";

import type { Request } from "./client";

export function createEndpoints(request: Request) {
  return {
    searchGames: (input: { q: string; limit?: number; offset?: number }) =>
      request<GameListResponse>("/api/games/search", {
        query: {
          q: input.q,
          limit: input.limit ?? SEARCH_LIMIT_DEFAULT,
          offset: input.offset ?? 0,
        },
      }),

    gameFeed: (feed: GameFeed, input: { limit?: number } = {}) =>
      request<GameListResponse>(`/api/games/${feed}`, {
        query: { limit: input.limit ?? SEARCH_LIMIT_DEFAULT },
      }),

    getGame: (id: number) => request<GameDetailResponse>(`/api/games/${id}`),

    similarGames: (id: number, input: { limit?: number } = {}) =>
      request<GameListResponse>(`/api/games/${id}/similar`, {
        query: { limit: input.limit ?? SIMILAR_LIMIT_DEFAULT },
      }),

    identifyShare: (input: { url: string; limit?: number }) =>
      request<ShareIdentifyResponse>("/api/games/identify", {
        method: "POST",
        body: { url: input.url, limit: input.limit ?? IDENTIFY_LIMIT_DEFAULT },
      }),

    // The server's default order, which `patchBacklogList` mirrors.
    listBacklog: () => request<BacklogListResponse>("/api/backlog"),

    // A missing `rating` keeps the stored one and `null` clears it, so a move
    // leaves the key out rather than sending `undefined`.
    upsertBacklogEntry: (
      gameId: number,
      input: { status: BacklogStatus; rating?: number | null },
    ) =>
      request<BacklogEntryWire>(`/api/backlog/${gameId}`, {
        method: "PUT",
        body:
          input.rating === undefined
            ? { status: input.status }
            : { status: input.status, rating: input.rating },
      }),

    deleteBacklogEntry: (gameId: number) =>
      request<void>(`/api/backlog/${gameId}`, { method: "DELETE" }),

    getMe: () => request<MeResponse>("/api/me"),

    refreshSubscription: () =>
      request<MeResponse>("/api/subscription/refresh", { method: "POST", body: {} }),
  };
}

export type Endpoints = ReturnType<typeof createEndpoints>;
