import type { BacklogStatus } from "./backlog.js";

/**
 * Types only — no valibot, no runtime code, nothing from `@repo/db`, so the
 * mobile bundle never pulls a Node dependency in. Dates are ISO strings, not
 * `Date`; `apps/api/src/serialize.ts` converts them.
 */

export interface NamedRef {
  id: number;
  name: string;
  slug: string;
}

export interface PlatformRef extends NamedRef {
  abbreviation: string | null;
}

export interface GameSummaryWire {
  id: number;
  name: string;
  slug: string;
  coverImageId: string | null;
  firstReleaseDate: string | null;
  totalRating: number | null;
  totalRatingCount: number;
}

export interface GameDetailWire extends GameSummaryWire {
  summary: string | null;
  gameType: { id: number; name: string } | null;
  parentGame: { id: number; name: string } | null;
  screenshots: string[];
  genres: NamedRef[];
  platforms: PlatformRef[];
  developers: NamedRef[];
  publishers: NamedRef[];
}

export interface BacklogEntryWire {
  gameId: number;
  status: BacklogStatus;
  rating: number | null;
  addedAt: string;
  updatedAt: string;
}

export interface BacklogListItemWire extends BacklogEntryWire {
  game: GameSummaryWire;
}

/** `GET /api/games/search`, `GET /api/games/popular` */
export interface GameListResponse {
  items: GameSummaryWire[];
}

/**
 * `GET /api/games/:id`. The embedded `backlogEntry` gives the game screen its
 * button state in one request, and makes the response user-varying — hence
 * `Cache-Control: private, no-cache` on the API side.
 */
export interface GameDetailResponse extends GameDetailWire {
  backlogEntry: BacklogEntryWire | null;
}

/** `GET /api/backlog` */
export interface BacklogListResponse {
  items: BacklogListItemWire[];
}

/** `GET /api/backlog/stats` */
export interface BacklogStatsWire {
  total: number;
  counts: Record<BacklogStatus, number>;
  averageRating: number | null;
}

/**
 * RFC 9457 as the API renders it: validation issues are `{field, message}` with
 * a dot-joined path, and a 422 carries `type: "about:blank"` with no `instance`
 * or `traceId` (the correlation id travels in `X-Request-Id`).
 *
 * A 5xx never carries `detail`, deliberately — exception messages leak schema
 * names and file paths — so 5xx copy must not depend on one.
 */
export interface ProblemDocument {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  traceId?: string;
  errors?: { field: string; message: string }[];
}
