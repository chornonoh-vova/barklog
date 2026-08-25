import { schema } from "@repo/db";
import type { MappedPage } from "@repo/igdb";
import { inArray, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

type Db = NodePgDatabase<typeof schema>;

const excluded = (column: string) => sql.raw(`excluded.${column}`);

/**
 * Writes one IGDB page in a single transaction. Reference rows are upserted
 * first so the games and join rows can never reference a missing parent, and
 * join rows are replaced wholesale so anything IGDB dropped disappears.
 *
 * Every write is an upsert or a scoped replace, which is what makes replaying
 * a page a no-op — the property the sync's failure model depends on.
 */
export async function persistPage(db: Db, page: MappedPage): Promise<void> {
  if (page.games.length === 0) return;

  const gameIds = page.games.map((game) => game.id);

  await db.transaction(async (tx) => {
    if (page.gameTypes.length > 0) {
      await tx
        .insert(schema.gameTypes)
        .values(page.gameTypes)
        .onConflictDoUpdate({ target: schema.gameTypes.id, set: { name: excluded("name") } });
    }

    if (page.genres.length > 0) {
      await tx
        .insert(schema.genres)
        .values(page.genres)
        .onConflictDoUpdate({
          target: schema.genres.id,
          set: { name: excluded("name"), slug: excluded("slug") },
        });
    }

    if (page.platforms.length > 0) {
      await tx
        .insert(schema.platforms)
        .values(page.platforms)
        .onConflictDoUpdate({
          target: schema.platforms.id,
          set: {
            name: excluded("name"),
            abbreviation: excluded("abbreviation"),
            slug: excluded("slug"),
          },
        });
    }

    if (page.companies.length > 0) {
      await tx
        .insert(schema.companies)
        .values(page.companies)
        .onConflictDoUpdate({
          target: schema.companies.id,
          set: { name: excluded("name"), slug: excluded("slug") },
        });
    }

    await tx
      .insert(schema.games)
      .values(page.games)
      .onConflictDoUpdate({
        target: schema.games.id,
        set: {
          name: excluded("name"),
          slug: excluded("slug"),
          summary: excluded("summary"),
          firstReleaseDate: excluded("first_release_date"),
          gameTypeId: excluded("game_type_id"),
          parentGameId: excluded("parent_game_id"),
          totalRating: excluded("total_rating"),
          totalRatingCount: excluded("total_rating_count"),
          coverImageId: excluded("cover_image_id"),
          igdbUpdatedAt: excluded("igdb_updated_at"),
          syncedAt: sql`now()`,
        },
      });

    await tx.delete(schema.gameScreenshots).where(inArray(schema.gameScreenshots.gameId, gameIds));
    await tx.delete(schema.gameGenres).where(inArray(schema.gameGenres.gameId, gameIds));
    await tx.delete(schema.gamePlatforms).where(inArray(schema.gamePlatforms.gameId, gameIds));
    await tx.delete(schema.gameCompanies).where(inArray(schema.gameCompanies.gameId, gameIds));

    if (page.screenshots.length > 0) {
      await tx.insert(schema.gameScreenshots).values(page.screenshots);
    }
    if (page.gameGenres.length > 0) {
      await tx.insert(schema.gameGenres).values(page.gameGenres);
    }
    if (page.gamePlatforms.length > 0) {
      await tx.insert(schema.gamePlatforms).values(page.gamePlatforms);
    }
    if (page.gameCompanies.length > 0) {
      await tx.insert(schema.gameCompanies).values(page.gameCompanies);
    }
  });
}
