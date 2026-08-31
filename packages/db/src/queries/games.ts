import { and, asc, desc, eq, gt, gte, inArray, isNotNull, lt, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { alias } from "drizzle-orm/pg-core";

import type * as schema from "../schema/index.js";
import {
  companies,
  gameCompanies,
  gameGenres,
  gamePlatforms,
  games,
  gameScreenshots,
  gameSimilar,
  gameTypes,
  genres,
  platforms,
} from "../schema/mirror.js";

type Db = NodePgDatabase<typeof schema>;

/** Main Game, Standalone Expansion, Remake, Remaster, Expanded Game. */
export const SEARCHABLE_GAME_TYPE_IDS = [0, 4, 8, 9, 10] as const;

export const WORD_SIMILARITY_THRESHOLD = 0.3;
export const SIMILARITY_WEIGHT = 0.6;
export const POPULARITY_WEIGHT = 0.4;
export const POPULARITY_CEILING = 500;

export const POPULAR_RATING_FLOOR = 70;

/**
 * Must equal the predicate on `games_popular_idx` in `schema/mirror.ts`, or
 * Postgres cannot use the index and seq-scans instead (45ms versus 0.36ms).
 */
export const POPULAR_RATING_COUNT_FLOOR = 50;

const searchableType = inArray(games.gameTypeId, [...SEARCHABLE_GAME_TYPE_IDS]);

export interface GameSummary {
  id: number;
  name: string;
  slug: string;
  coverImageId: string | null;
  firstReleaseDate: Date | null;
  totalRating: number | null;
  totalRatingCount: number;
}

export interface NamedRef {
  id: number;
  name: string;
  slug: string;
}

export interface PlatformRef extends NamedRef {
  abbreviation: string | null;
}

export interface GameDetail extends GameSummary {
  summary: string | null;
  gameType: { id: number; name: string } | null;
  parentGame: { id: number; name: string } | null;
  screenshots: string[];
  genres: NamedRef[];
  platforms: PlatformRef[];
  developers: NamedRef[];
  publishers: NamedRef[];
}

export const GAME_SUMMARY_COLUMNS = {
  id: games.id,
  name: games.name,
  slug: games.slug,
  coverImageId: games.coverImageId,
  firstReleaseDate: games.firstReleaseDate,
  totalRating: games.totalRating,
  totalRatingCount: games.totalRatingCount,
};

/**
 * `word_similarity`, not `similarity`: the latter compares whole strings, so
 * `zeld` against `The Legend of Zelda` scores near zero. Its threshold is a GUC,
 * hence the transaction — `SET LOCAL` reverts on commit and leaves the pooled
 * connection clean.
 */
export async function searchGames(
  db: Db,
  options: { query: string; limit: number; offset: number },
): Promise<GameSummary[]> {
  const { query, limit, offset } = options;

  return db.transaction(async (tx) => {
    // `SET LOCAL` takes no bind parameter, so this is string-built — safe only
    // because the threshold is a module constant, never caller-supplied.
    await tx.execute(
      sql.raw(`SET LOCAL pg_trgm.word_similarity_threshold = ${WORD_SIMILARITY_THRESHOLD}`),
    );

    return tx
      .select(GAME_SUMMARY_COLUMNS)
      .from(games)
      .where(and(sql`${query} <% ${games.name}`, searchableType))
      .orderBy(
        desc(
          sql`${SIMILARITY_WEIGHT} * word_similarity(${query}, ${games.name})
            + ${POPULARITY_WEIGHT} * LEAST(${games.totalRatingCount}, ${POPULARITY_CEILING})::real
              / ${POPULARITY_CEILING}`,
        ),
        desc(games.totalRatingCount),
        asc(games.id),
      )
      .limit(limit)
      .offset(offset);
  });
}

export async function popularGames(db: Db, options: { limit: number }): Promise<GameSummary[]> {
  return db
    .select(GAME_SUMMARY_COLUMNS)
    .from(games)
    .where(
      and(
        gte(games.totalRating, POPULAR_RATING_FLOOR),
        gt(games.totalRatingCount, POPULAR_RATING_COUNT_FLOOR),
        searchableType,
      ),
    )
    .orderBy(desc(games.totalRatingCount), asc(games.id))
    .limit(options.limit);
}

const RECENT_WINDOW_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

const releaseFeedFilter = and(searchableType, isNotNull(games.coverImageId));

export async function upcomingGames(
  db: Db,
  options: { limit: number; now: Date },
): Promise<GameSummary[]> {
  return db
    .select(GAME_SUMMARY_COLUMNS)
    .from(games)
    .where(and(gte(games.firstReleaseDate, startOfUtcDay(options.now)), releaseFeedFilter))
    .orderBy(asc(games.firstReleaseDate), asc(games.id))
    .limit(options.limit);
}

export async function recentGames(
  db: Db,
  options: { limit: number; now: Date },
): Promise<GameSummary[]> {
  const today = startOfUtcDay(options.now);
  const from = new Date(today.getTime() - RECENT_WINDOW_DAYS * DAY_MS);

  return db
    .select(GAME_SUMMARY_COLUMNS)
    .from(games)
    .where(
      and(gte(games.firstReleaseDate, from), lt(games.firstReleaseDate, today), releaseFeedFilter),
    )
    .orderBy(desc(games.totalRatingCount), asc(games.id))
    .limit(options.limit);
}

export async function gameExists(db: Db, gameId: number): Promise<boolean> {
  const rows = await db.select({ id: games.id }).from(games).where(eq(games.id, gameId)).limit(1);
  return rows.length > 0;
}

export async function getGameDetail(db: Db, gameId: number): Promise<GameDetail | null> {
  const parent = alias(games, "parent");

  const rows = await db
    .select({
      ...GAME_SUMMARY_COLUMNS,
      summary: games.summary,
      gameTypeId: gameTypes.id,
      gameTypeName: gameTypes.name,
      parentGameId: parent.id,
      parentGameName: parent.name,
    })
    .from(games)
    .leftJoin(gameTypes, eq(games.gameTypeId, gameTypes.id))
    .leftJoin(parent, eq(games.parentGameId, parent.id))
    .where(eq(games.id, gameId))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const [screenshotRows, genreRows, platformRows, companyRows] = await Promise.all([
    db
      .select({ imageId: gameScreenshots.imageId })
      .from(gameScreenshots)
      .where(eq(gameScreenshots.gameId, gameId))
      .orderBy(asc(gameScreenshots.imageId)),
    db
      .select({ id: genres.id, name: genres.name, slug: genres.slug })
      .from(gameGenres)
      .innerJoin(genres, eq(gameGenres.genreId, genres.id))
      .where(eq(gameGenres.gameId, gameId))
      .orderBy(asc(genres.name)),
    db
      .select({
        id: platforms.id,
        name: platforms.name,
        abbreviation: platforms.abbreviation,
        slug: platforms.slug,
      })
      .from(gamePlatforms)
      .innerJoin(platforms, eq(gamePlatforms.platformId, platforms.id))
      .where(eq(gamePlatforms.gameId, gameId))
      .orderBy(asc(platforms.name)),
    db
      .select({
        id: companies.id,
        name: companies.name,
        slug: companies.slug,
        isDeveloper: gameCompanies.isDeveloper,
        isPublisher: gameCompanies.isPublisher,
      })
      .from(gameCompanies)
      .innerJoin(companies, eq(gameCompanies.companyId, companies.id))
      .where(eq(gameCompanies.gameId, gameId))
      .orderBy(asc(companies.name)),
  ]);

  const toRef = (company: (typeof companyRows)[number]): NamedRef => ({
    id: company.id,
    name: company.name,
    slug: company.slug,
  });

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    summary: row.summary,
    coverImageId: row.coverImageId,
    firstReleaseDate: row.firstReleaseDate,
    totalRating: row.totalRating,
    totalRatingCount: row.totalRatingCount,
    gameType:
      row.gameTypeId === null || row.gameTypeName === null
        ? null
        : { id: row.gameTypeId, name: row.gameTypeName },
    parentGame:
      row.parentGameId === null || row.parentGameName === null
        ? null
        : { id: row.parentGameId, name: row.parentGameName },
    screenshots: screenshotRows.map((screenshot) => screenshot.imageId),
    genres: genreRows,
    platforms: platformRows,
    developers: companyRows.filter((company) => company.isDeveloper).map(toRef),
    publishers: companyRows.filter((company) => company.isPublisher).map(toRef),
  };
}

export async function similarGames(
  db: Db,
  options: { gameId: number; limit: number },
): Promise<GameSummary[]> {
  return db
    .select(GAME_SUMMARY_COLUMNS)
    .from(gameSimilar)
    .innerJoin(games, eq(gameSimilar.similarGameId, games.id))
    .where(and(eq(gameSimilar.gameId, options.gameId), searchableType))
    .orderBy(desc(games.totalRatingCount), asc(games.id))
    .limit(options.limit);
}
