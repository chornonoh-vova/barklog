import type {
  BacklogEntry,
  BacklogListItem,
  BacklogStatusValue,
  GameDetail,
  GameSummary,
  NamedRef,
  PlatformRef,
} from "@repo/db";

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
  status: BacklogStatusValue;
  rating: number | null;
  addedAt: string;
  updatedAt: string;
}

export interface BacklogListItemWire extends BacklogEntryWire {
  game: GameSummaryWire;
}

/**
 * Rows become wire shapes before anything is cached or hashed. `JSON.stringify`
 * would turn a Date into the same string either way, but then a cache hit would
 * hand the route a string where a miss handed it a Date — a type that is a lie
 * half the time, and an ETag that changes for no reason.
 */
const iso = (value: Date | null): string | null => (value === null ? null : value.toISOString());

export function toGameSummary(row: GameSummary): GameSummaryWire {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    coverImageId: row.coverImageId,
    firstReleaseDate: iso(row.firstReleaseDate),
    totalRating: row.totalRating,
    totalRatingCount: row.totalRatingCount,
  };
}

export function toGameDetail(row: GameDetail): GameDetailWire {
  return {
    ...toGameSummary(row),
    summary: row.summary,
    gameType: row.gameType,
    parentGame: row.parentGame,
    screenshots: row.screenshots,
    genres: row.genres,
    platforms: row.platforms,
    developers: row.developers,
    publishers: row.publishers,
  };
}

export function toBacklogEntry(entry: BacklogEntry): BacklogEntryWire {
  return {
    gameId: entry.gameId,
    status: entry.status,
    rating: entry.rating,
    addedAt: entry.addedAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

export function toBacklogListItem(item: BacklogListItem): BacklogListItemWire {
  return { ...toBacklogEntry(item), game: toGameSummary(item.game) };
}
