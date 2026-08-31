import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const gameTypes = pgTable("game_types", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
});

export const genres = pgTable("genres", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
});

export const platforms = pgTable("platforms", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  abbreviation: text("abbreviation"),
  slug: text("slug").notNull(),
});

export const companies = pgTable("companies", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
});

export const games = pgTable(
  "games",
  {
    id: integer("id").primaryKey(),
    name: text("name").notNull(),
    // Indexed but NOT unique: IGDB slugs occasionally migrate between games,
    // and a unique constraint would turn that into a failed sync page.
    slug: text("slug").notNull(),
    summary: text("summary"),
    firstReleaseDate: timestamp("first_release_date", { withTimezone: true }),
    gameTypeId: integer("game_type_id").references(() => gameTypes.id),
    // Deliberately no foreign key — see the test in mirror-schema.test.ts.
    parentGameId: integer("parent_game_id"),
    totalRating: real("total_rating"),
    totalRatingCount: integer("total_rating_count").notNull().default(0),
    coverImageId: text("cover_image_id"),
    igdbUpdatedAt: timestamp("igdb_updated_at", { withTimezone: true }).notNull(),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("games_slug_idx").on(t.slug),
    index("games_name_trgm_idx").using("gin", sql`${t.name} gin_trgm_ops`),
    index("games_popular_idx")
      .on(sql`${t.totalRatingCount} DESC`)
      .where(sql`${t.totalRatingCount} > 50`),
    // Serves both release feeds. The moving window cannot go in the predicate
    // — it would have to reference now() — but the null half is static, and
    // both feeds' range quals imply it.
    index("games_release_date_idx")
      .on(t.firstReleaseDate)
      .where(sql`${t.firstReleaseDate} is not null`),
  ],
);

export const gameScreenshots = pgTable(
  "game_screenshots",
  {
    gameId: integer("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    imageId: text("image_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.gameId, t.imageId] })],
);

export const gameGenres = pgTable(
  "game_genres",
  {
    gameId: integer("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    genreId: integer("genre_id")
      .notNull()
      .references(() => genres.id),
  },
  (t) => [primaryKey({ columns: [t.gameId, t.genreId] })],
);

export const gamePlatforms = pgTable(
  "game_platforms",
  {
    gameId: integer("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    platformId: integer("platform_id")
      .notNull()
      .references(() => platforms.id),
  },
  (t) => [primaryKey({ columns: [t.gameId, t.platformId] })],
);

export const gameCompanies = pgTable(
  "game_companies",
  {
    gameId: integer("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id),
    isDeveloper: boolean("is_developer").notNull().default(false),
    isPublisher: boolean("is_publisher").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.gameId, t.companyId] })],
);

/**
 * IGDB's own `similar_games`, one row per suggestion. The relation is
 * directional — A listing B does not make B list A — and is read forward only.
 */
export const gameSimilar = pgTable(
  "game_similar",
  {
    gameId: integer("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    // Deliberately no foreign key, for the same reason as games.parentGameId:
    // the sync walks ids ascending, so a page routinely names a similar game
    // not yet inserted, and an FK would fail the page. Dangling ids are
    // dropped on read by the inner join in similarGames().
    similarGameId: integer("similar_game_id").notNull(),
  },
  // No secondary index: the only read is `where game_id = $1`, which the
  // primary key's leading column already serves.
  (t) => [primaryKey({ columns: [t.gameId, t.similarGameId] })],
);
