import { EXTRACTED_BASES } from "@repo/contracts";
import { getLogger } from "@logtape/logtape";
import OpenAI from "openai";
import * as v from "valibot";

import type { VideoMeta } from "./oembed.js";

const log = getLogger(["api", "share"]);

/** Bump on any prompt edit: it is part of the cache key. */
export const EXTRACT_PROMPT_VERSION = 2;

/** Each guess costs one mirror search, so the fan-out is bounded here. */
export const MAX_GUESSES = 3;

const MAX_OUTPUT_TOKENS = 256;

export interface Extraction {
  titles: string[];
  basis: (typeof EXTRACTED_BASES)[number];
}

const SYSTEM = `You identify which video game a short video is about, from its title and channel name.

Reply with the game's canonical English title as a games database would list it, not as the video spells it. Expand abbreviations and nicknames: "RE2" is "Resident Evil 2", "BOTW" is "The Legend of Zelda: Breath of the Wild", "GTA V" is "Grand Theft Auto V".

Work down these tiers, stop at the first that applies, and set \`basis\` to the tier you used:
- "title": the video's own title names or clearly implies a game.
- "channel": the title does not, but you recognise the channel and it covers a game or a small set of games. Guess those.
- "none": neither. Return no titles.

Give up to ${MAX_GUESSES} titles, most likely first. When a title could mean an original or its remake, list both, original first. Never invent a channel you do not recognise, and never pad the list to reach ${MAX_GUESSES}.`;

const responseSchema = v.object({
  titles: v.array(v.pipe(v.string(), v.trim())),
  basis: v.picklist(EXTRACTED_BASES),
});

/**
 * Separated from the API call so the parsing rules are testable without a
 * network or a key. Throws on anything unexpected: the caller fails soft, and
 * a throw is what keeps the bad answer out of the cache.
 */
export function parseExtraction(raw: string): Extraction {
  // JSON.parse, never a string match: structured output may escape unicode or
  // forward slashes differently from one model to the next.
  const parsed = v.parse(responseSchema, JSON.parse(raw));

  const titles = parsed.titles.filter((title) => title !== "").slice(0, MAX_GUESSES);

  // The two fields can disagree. A basis describes titles, and `none`
  // disclaims them, so either one being empty collapses to `none`.
  if (parsed.basis === "none" || titles.length === 0) return { titles: [], basis: "none" };

  return { titles, basis: parsed.basis };
}

export function createTitleExtractor(options: {
  apiKey: string;
  model: string;
}): (meta: VideoMeta) => Promise<Extraction> {
  const client = new OpenAI({ apiKey: options.apiKey });

  return async function extractTitles(meta: VideoMeta): Promise<Extraction> {
    const author = meta.author === null ? "" : `\nChannel: ${meta.author}`;

    const response = await client.responses.create({
      model: options.model,
      instructions: SYSTEM,
      input: `Video title: ${meta.title}${author}`,
      max_output_tokens: MAX_OUTPUT_TOKENS,
      // The Responses API stores prompts for 30 days by default. The Anthropic
      // API this replaced stored nothing, and the privacy policy promises the
      // title and channel name go no further than the guess.
      store: false,
      // Pinned rather than left to the model's default, which has changed
      // across generations. This is a sub-second classification over ~250
      // tokens and should not pay for reasoning; `env.ts` is what keeps the
      // model list to those that accept `none`.
      reasoning: { effort: "none" },
      text: {
        format: {
          type: "json_schema",
          name: "game_titles",
          strict: true,
          schema: {
            type: "object",
            properties: {
              // No `maxItems`: strict mode's support for it is unreliable, so
              // `parseExtraction` caps the list instead.
              titles: { type: "array", items: { type: "string" } },
              basis: { type: "string", enum: [...EXTRACTED_BASES] },
            },
            required: ["titles", "basis"],
            additionalProperties: false,
          },
        },
      },
    });

    const extraction = parseExtraction(response.output_text);

    log.debug("extracted {count} title(s) from {title}", {
      count: extraction.titles.length,
      basis: extraction.basis,
      title: meta.title,
      inputTokens: response.usage?.input_tokens,
      outputTokens: response.usage?.output_tokens,
    });

    return extraction;
  };
}
