import * as v from "valibot";

import { igdbGameSchema } from "./schemas.js";

export interface MappedPage {
  gameTypes: { id: number; name: string }[];
  genres: { id: number; name: string; slug: string }[];
  platforms: { id: number; name: string; abbreviation: string | null; slug: string }[];
  companies: { id: number; name: string; slug: string }[];
  games: {
    id: number;
    name: string;
    slug: string;
    summary: string | null;
    firstReleaseDate: Date | null;
    gameTypeId: number | null;
    parentGameId: number | null;
    totalRating: number | null;
    totalRatingCount: number;
    coverImageId: string | null;
    igdbUpdatedAt: Date;
  }[];
  screenshots: { gameId: number; imageId: string }[];
  gameGenres: { gameId: number; genreId: number }[];
  gamePlatforms: { gameId: number; platformId: number }[];
  gameSimilar: { gameId: number; similarGameId: number }[];
  gameCompanies: {
    gameId: number;
    companyId: number;
    isDeveloper: boolean;
    isPublisher: boolean;
  }[];
}

const seconds = (value: number) => new Date(value * 1000);

export function mapGames(raw: unknown[]): MappedPage {
  const games = raw.map((row) => v.parse(igdbGameSchema, row));

  // Reference rows are deduplicated by id: two games in one page routinely
  // share a genre, and inserting it twice in one statement raises
  // "ON CONFLICT DO UPDATE command cannot affect row a second time".
  const gameTypes = new Map<number, MappedPage["gameTypes"][number]>();
  const genres = new Map<number, MappedPage["genres"][number]>();
  const platforms = new Map<number, MappedPage["platforms"][number]>();
  const companies = new Map<number, MappedPage["companies"][number]>();
  // Keyed by `${gameId}:${companyId}` so a company listed twice for one game —
  // once as developer, once as publisher — merges into a single row.
  const gameCompanies = new Map<string, MappedPage["gameCompanies"][number]>();
  // Unlike genres and platforms — curated sets where trusting IGDB not to
  // repeat an entry is safe — this list is generated, and one duplicate would
  // be a unique violation that fails the entire page.
  const seenSimilar = new Set<string>();

  const page: MappedPage = {
    gameTypes: [],
    genres: [],
    platforms: [],
    companies: [],
    games: [],
    screenshots: [],
    gameGenres: [],
    gamePlatforms: [],
    gameSimilar: [],
    gameCompanies: [],
  };

  for (const game of games) {
    if (game.game_type) {
      gameTypes.set(game.game_type.id, { id: game.game_type.id, name: game.game_type.type });
    }

    page.games.push({
      id: game.id,
      name: game.name,
      slug: game.slug,
      summary: game.summary ?? null,
      firstReleaseDate: game.first_release_date ? seconds(game.first_release_date) : null,
      gameTypeId: game.game_type?.id ?? null,
      parentGameId: game.parent_game ?? null,
      totalRating: game.total_rating ?? null,
      totalRatingCount: game.total_rating_count ?? 0,
      coverImageId: game.cover?.image_id ?? null,
      igdbUpdatedAt: seconds(game.updated_at),
    });

    for (const shot of game.screenshots ?? []) {
      page.screenshots.push({ gameId: game.id, imageId: shot.image_id });
    }

    for (const similarId of game.similar_games ?? []) {
      // A game inside its own Similar Games row reads as a bug, and IGDB's
      // generated list does not rule it out.
      if (similarId === game.id) continue;

      const key = `${game.id}:${similarId}`;
      if (seenSimilar.has(key)) continue;
      seenSimilar.add(key);

      page.gameSimilar.push({ gameId: game.id, similarGameId: similarId });
    }

    for (const genre of game.genres ?? []) {
      genres.set(genre.id, { id: genre.id, name: genre.name, slug: genre.slug });
      page.gameGenres.push({ gameId: game.id, genreId: genre.id });
    }

    for (const platform of game.platforms ?? []) {
      platforms.set(platform.id, {
        id: platform.id,
        name: platform.name,
        abbreviation: platform.abbreviation ?? null,
        slug: platform.slug,
      });
      page.gamePlatforms.push({ gameId: game.id, platformId: platform.id });
    }

    for (const involved of game.involved_companies ?? []) {
      const { company } = involved;
      companies.set(company.id, { id: company.id, name: company.name, slug: company.slug });

      const key = `${game.id}:${company.id}`;
      const existing = gameCompanies.get(key);
      gameCompanies.set(key, {
        gameId: game.id,
        companyId: company.id,
        isDeveloper: (existing?.isDeveloper ?? false) || (involved.developer ?? false),
        isPublisher: (existing?.isPublisher ?? false) || (involved.publisher ?? false),
      });
    }
  }

  page.gameTypes = [...gameTypes.values()];
  page.genres = [...genres.values()];
  page.platforms = [...platforms.values()];
  page.companies = [...companies.values()];
  page.gameCompanies = [...gameCompanies.values()];

  return page;
}
