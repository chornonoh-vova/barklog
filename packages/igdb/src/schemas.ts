import * as v from "valibot";

const int = v.pipe(v.number(), v.integer());

const referenceSchema = v.object({
  id: int,
  name: v.string(),
  slug: v.string(),
});

export const igdbGameSchema = v.object({
  id: int,
  name: v.string(),
  slug: v.string(),
  summary: v.optional(v.string()),
  first_release_date: v.optional(int),
  updated_at: int,
  total_rating: v.optional(v.number()),
  total_rating_count: v.optional(int),
  parent_game: v.optional(int),
  similar_games: v.optional(v.array(int)),
  game_type: v.optional(v.object({ id: int, type: v.string() })),
  cover: v.optional(v.object({ id: int, image_id: v.string() })),
  screenshots: v.optional(v.array(v.object({ id: int, image_id: v.string() }))),
  genres: v.optional(v.array(referenceSchema)),
  platforms: v.optional(
    v.array(
      v.object({
        id: int,
        name: v.string(),
        abbreviation: v.optional(v.string()),
        slug: v.string(),
      }),
    ),
  ),
  involved_companies: v.optional(
    v.array(
      v.object({
        id: int,
        company: referenceSchema,
        developer: v.optional(v.boolean()),
        publisher: v.optional(v.boolean()),
      }),
    ),
  ),
});

export type IgdbGame = v.InferOutput<typeof igdbGameSchema>;
