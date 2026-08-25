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
