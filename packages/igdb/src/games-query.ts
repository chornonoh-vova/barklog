/**
 * Non-deprecated fields only — never add `category` or `status` back. The
 * nightly contract test fails the build if IGDB rejects anything here.
 */
export const GAME_FIELDS = [
  "id",
  "name",
  "slug",
  "summary",
  "first_release_date",
  "updated_at",
  "total_rating",
  "total_rating_count",
  "parent_game",
  "similar_games",
  "game_type.id",
  "game_type.type",
  "cover.image_id",
  "screenshots.image_id",
  "genres.id",
  "genres.name",
  "genres.slug",
  "platforms.id",
  "platforms.name",
  "platforms.abbreviation",
  "platforms.slug",
  "involved_companies.company.id",
  "involved_companies.company.name",
  "involved_companies.company.slug",
  "involved_companies.developer",
  "involved_companies.publisher",
].join(",");

export interface GamesPageQueryOptions {
  since: Date | null;
  afterId: number;
  limit: number;
}

export function gamesPageQuery(options: GamesPageQueryOptions): string {
  const where =
    options.since === null
      ? `where id > ${options.afterId};`
      : `where updated_at > ${Math.floor(options.since.getTime() / 1000)} & id > ${options.afterId};`;

  return [`fields ${GAME_FIELDS};`, where, "sort id asc;", `limit ${options.limit};`].join("\n");
}
