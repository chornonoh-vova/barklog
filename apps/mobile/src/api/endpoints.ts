import {
  SEARCH_LIMIT_DEFAULT,
  type BacklogEntryWire,
  type BacklogListResponse,
  type BacklogSort,
  type BacklogStatsWire,
  type BacklogStatus,
  type GameDetailResponse,
  type GameListResponse,
} from "@repo/contracts";

import type { Request } from "./client";

/** One function per route in the API design's §8. */
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

    popularGames: (input: { limit?: number } = {}) =>
      request<GameListResponse>("/api/games/popular", {
        query: { limit: input.limit ?? SEARCH_LIMIT_DEFAULT },
      }),

    getGame: (id: number) => request<GameDetailResponse>(`/api/games/${id}`),

    listBacklog: (input: { status?: BacklogStatus; sort?: BacklogSort } = {}) =>
      request<BacklogListResponse>("/api/backlog", {
        // `undefined` is dropped by the query builder, which is how "All"
        // becomes an unfiltered request rather than `?status=`.
        query: { status: input.status, sort: input.sort ?? "updated_at" },
      }),

    getBacklogStats: () => request<BacklogStatsWire>("/api/backlog/stats"),

    upsertBacklogEntry: (gameId: number, input: { status: BacklogStatus; rating: number | null }) =>
      request<BacklogEntryWire>(`/api/backlog/${gameId}`, {
        method: "PUT",
        body: { status: input.status, rating: input.rating },
      }),

    deleteBacklogEntry: (gameId: number) =>
      request<void>(`/api/backlog/${gameId}`, { method: "DELETE" }),
  };
}

export type Endpoints = ReturnType<typeof createEndpoints>;
