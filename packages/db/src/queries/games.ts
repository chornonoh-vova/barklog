import { and, asc, desc, eq, gt, gte, inArray, sql } from "drizzle-orm";
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
  gameTypes,
  genres,
  platforms,
} from "../schema/mirror.js";

type Db = NodePgDatabase<typeof schema>;

/**
 * Read from the live `/game_types` data, not transcribed from the legacy enum
 * (spec §7): Main Game, Standalone Expansion, Remake, Remaster, Expanded Game.
 * 316,525 of the 373,590 mirrored games.
 */
export const SEARCHABLE_GAME_TYPE_IDS = [0, 4, 8, 9, 10] as const;

/**
 * Ranking constants. Starting points tuned against the real mirror, and the
 * reason they live here: changing how search feels is a one-line change with a
 * fixture test behind it, not a query rewrite.
 */
export const WORD_SIMILARITY_THRESHOLD = 0.3;
export const SIMILARITY_WEIGHT = 0.6;
export const POPULARITY_WEIGHT = 0.4;
export const POPULARITY_CEILING = 500;

/** The explore feed only shows games people have actually rated well. */
export const POPULAR_RATING_FLOOR = 70;

/**
 * Must equal the predicate on `games_popular_idx` (a partial index on
 * `total_rating_count DESC WHERE total_rating_count > 50`, see
 * `schema/mirror.ts`). `popularGames`'s rating floor alone does not imply
 * that predicate, so without repeating it here Postgres cannot use the
 * index and falls back to a sequential scan: measured on the real mirror,
 * 45ms seq scan versus 0.36ms index scan. A future change to either the
 * index or this constant must change the other.
 */
export const POPULAR_RATING_COUNT_FLOOR = 50;

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

/** The projection every list endpoint returns. Also used nested, as `game`. */
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
 * `word_similarity` rather than plain `similarity`: plain similarity compares
 * whole strings, so `zeld` against `The Legend of Zelda: Ocarina of Time` scores
 * near zero. `word_similarity` scores the query against the best-matching span
 * of words inside the name. The `<%` operator uses the same gin_trgm_ops index.
 *
 * The threshold is a GUC, so this runs in a transaction: `SET LOCAL` is scoped
 * to it and reverts on commit, which keeps the pooled connection clean.
 */
export async function searchGames(
  db: Db,
  options: { query: string; limit: number; offset: number },
): Promise<GameSummary[]> {
  const { query, limit, offset } = options;

  return db.transaction(async (tx) => {
    // The repo's only raw-SQL interpolation. `SET LOCAL` cannot take a bind
    // parameter, so this is a string-built statement — safe only because
    // WORD_SIMILARITY_THRESHOLD is a fixed module constant above, never
    // caller-supplied. A future edit that makes this value come from a
    // request must not reuse `sql.raw` here without addressing that.
    await tx.execute(
      sql.raw(`SET LOCAL pg_trgm.word_similarity_threshold = ${WORD_SIMILARITY_THRESHOLD}`),
    );

    return tx
      .select(GAME_SUMMARY_COLUMNS)
      .from(games)
      .where(
        and(
          sql`${query} <% ${games.name}`,
          inArray(games.gameTypeId, [...SEARCHABLE_GAME_TYPE_IDS]),
        ),
      )
      .orderBy(
        desc(
          sql`${SIMILARITY_WEIGHT} * word_similarity(${query}, ${games.name})
            + ${POPULARITY_WEIGHT} * LEAST(${games.totalRatingCount}, ${POPULARITY_CEILING})::real
              / ${POPULARITY_CEILING}`,
        ),
        desc(games.totalRatingCount),
        // A total order, so a page boundary can neither repeat nor skip a row.
        asc(games.id),
      )
      .limit(limit)
      .offset(offset);
  });
}

/**
 * `total_rating_count DESC` behind a `total_rating` floor. v1 uses rating count
 * as a proxy for IGDB's `popularity_primitives` (spec §17); swapping it in
 * touches this function only.
 */
export async function popularGames(db: Db, options: { limit: number }): Promise<GameSummary[]> {
  return db
    .select(GAME_SUMMARY_COLUMNS)
    .from(games)
    .where(
      and(
        gte(games.totalRating, POPULAR_RATING_FLOOR),
        gt(games.totalRatingCount, POPULAR_RATING_COUNT_FLOOR),
        inArray(games.gameTypeId, [...SEARCHABLE_GAME_TYPE_IDS]),
      ),
    )
    .orderBy(desc(games.totalRatingCount), asc(games.id))
    .limit(options.limit);
}

export async function gameExists(db: Db, gameId: number): Promise<boolean> {
  const rows = await db.select({ id: games.id }).from(games).where(eq(games.id, gameId)).limit(1);
  return rows.length > 0;
}

/**
 * Five indexed reads rather than one query with aggregate subselects: each is
 * a primary-key or composite-key lookup, and the assembly stays readable.
 * The caller's backlog entry is deliberately NOT joined here — the mirror half
 * of the schema and the user half meet in the route, not in a query.
 */
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
