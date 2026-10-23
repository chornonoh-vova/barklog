/** Wire-shaped builders: a valid default, with only what a test cares about overridden. */
import type {
  BacklogEntryWire,
  BacklogListItemWire,
  BacklogListResponse,
  BacklogStatus,
  GameDetailResponse,
  GameSummaryWire,
  MeResponse,
  ShareIdentifyResponse,
} from "@repo/contracts";

export const STAMP = "2026-01-01T00:00:00.000Z";

export function gameSummary(overrides: Partial<GameSummaryWire> = {}): GameSummaryWire {
  const id = overrides.id ?? 1;
  return {
    id,
    name: `Game ${id}`,
    slug: `game-${id}`,
    coverImageId: `cover${id}`,
    firstReleaseDate: "2020-03-01T00:00:00.000Z",
    totalRating: 85,
    totalRatingCount: 120,
    ...overrides,
  };
}

export function backlogEntry(overrides: Partial<BacklogEntryWire> = {}): BacklogEntryWire {
  return {
    gameId: 1,
    status: "waiting",
    rating: null,
    addedAt: STAMP,
    updatedAt: STAMP,
    ...overrides,
  };
}

export function backlogItem(
  gameId: number,
  status: BacklogStatus = "waiting",
  overrides: Partial<BacklogListItemWire> = {},
): BacklogListItemWire {
  return {
    ...backlogEntry({ gameId, status }),
    game: gameSummary({ id: gameId }),
    ...overrides,
  };
}

export function backlogList(...items: BacklogListItemWire[]): BacklogListResponse {
  return { items };
}

export function gameDetail(overrides: Partial<GameDetailResponse> = {}): GameDetailResponse {
  const summary = gameSummary({ id: overrides.id ?? 1 });
  return {
    ...summary,
    summary: "A game about games.",
    gameType: null,
    parentGame: null,
    screenshots: [],
    genres: [{ id: 1, name: "Adventure", slug: "adventure" }],
    platforms: [{ id: 1, name: "PlayStation 5", slug: "ps5", abbreviation: "PS5" }],
    developers: [{ id: 1, name: "Studio", slug: "studio" }],
    publishers: [{ id: 2, name: "Publisher", slug: "publisher" }],
    backlogEntry: null,
    ...overrides,
  };
}

export function me(overrides: Partial<MeResponse> = {}): MeResponse {
  return { premium: false, entitlement: null, ...overrides };
}

export function identifyResponse(
  overrides: Partial<ShareIdentifyResponse> = {},
): ShareIdentifyResponse {
  return {
    source: {
      provider: "youtube",
      shareId: "abc",
      title: "Hollow Knight Silksong review",
      author: "Reviewer",
      pageUrl: "https://www.youtube.com/watch?v=abc",
      thumbnailUrl: null,
      thumbnailWidth: null,
      thumbnailHeight: null,
    },
    basis: "title",
    identified: true,
    guesses: ["Hollow Knight: Silksong"],
    items: [gameSummary({ id: 7, name: "Hollow Knight: Silksong" })],
    ...overrides,
  };
}
