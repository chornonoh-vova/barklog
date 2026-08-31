import type {
  BacklogEntryWire,
  BacklogListItemWire,
  GameDetailWire,
  GameSummaryWire,
} from "@repo/contracts";
import type { BacklogEntry, BacklogListItem, GameDetail, GameSummary } from "@repo/db";

export type {
  BacklogEntryWire,
  BacklogListItemWire,
  GameDetailWire,
  GameSummaryWire,
} from "@repo/contracts";

// Rows are converted before anything is cached or hashed, or a hit and a miss
// would hand the route different types and shift the ETag.
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
