import { z } from "zod";

/**
 * IGDB omits absent fields rather than sending null, so every optional field is
 * `.optional()` and the mapper is responsible for turning that into null.
 */
const referenceSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  slug: z.string(),
});

export const igdbGameSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  slug: z.string(),
  summary: z.string().optional(),
  first_release_date: z.number().int().optional(),
  updated_at: z.number().int(),
  total_rating: z.number().optional(),
  total_rating_count: z.number().int().optional(),
  parent_game: z.number().int().optional(),
  game_type: z.object({ id: z.number().int(), type: z.string() }).optional(),
  cover: z.object({ id: z.number().int(), image_id: z.string() }).optional(),
  screenshots: z.array(z.object({ id: z.number().int(), image_id: z.string() })).optional(),
  genres: z.array(referenceSchema).optional(),
  platforms: z
    .array(
      z.object({
        id: z.number().int(),
        name: z.string(),
        abbreviation: z.string().optional(),
        slug: z.string(),
      }),
    )
    .optional(),
  involved_companies: z
    .array(
      z.object({
        id: z.number().int(),
        company: referenceSchema,
        developer: z.boolean().optional(),
        publisher: z.boolean().optional(),
      }),
    )
    .optional(),
});

export type IgdbGame = z.infer<typeof igdbGameSchema>;
