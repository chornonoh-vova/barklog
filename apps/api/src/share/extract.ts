import Anthropic from "@anthropic-ai/sdk";
import { getLogger } from "@logtape/logtape";
import * as v from "valibot";

import type { VideoMeta } from "./oembed.js";

const log = getLogger(["api", "share"]);

/** Bump on any prompt edit: it is part of the cache key. */
export const EXTRACT_PROMPT_VERSION = 1;

/** Each guess costs one mirror search, so the fan-out is bounded here. */
export const MAX_GUESSES = 3;

const MAX_TOKENS = 256;

const SYSTEM = `You identify which video game a short video is about, from its title and channel name.

Reply with the game's canonical English title as a games database would list it, not as the video spells it. Expand abbreviations and nicknames: "RE2" is "Resident Evil 2", "BOTW" is "The Legend of Zelda: Breath of the Wild", "GTA V" is "Grand Theft Auto V".

Give up to ${MAX_GUESSES} titles, most likely first. When a title could mean an original or its remake, list both, original first. When the text names no game at all, return an empty list rather than guessing from the channel's usual subject.`;

const responseSchema = v.object({
  titles: v.array(v.pipe(v.string(), v.trim())),
});

/**
 * Separated from the API call so the parsing rules are testable without a
 * network or a key. Throws on anything unexpected: the caller fails soft, and
 * a throw is what keeps the bad answer out of the cache.
 */
export function parseExtraction(raw: string): string[] {
  // JSON.parse, never a string match: structured output may escape unicode or
  // forward slashes differently from one model to the next.
  const parsed = v.parse(responseSchema, JSON.parse(raw));

  return parsed.titles.filter((title) => title !== "").slice(0, MAX_GUESSES);
}

export function createTitleExtractor(options: {
  apiKey: string;
  model: string;
}): (meta: VideoMeta) => Promise<string[]> {
  const client = new Anthropic({ apiKey: options.apiKey });

  return async function extractTitles(meta: VideoMeta): Promise<string[]> {
    const author = meta.author === null ? "" : `\nChannel: ${meta.author}`;

    const response = await client.messages.create({
      model: options.model,
      max_tokens: MAX_TOKENS,
      // A content-block array rather than a bare string, so the prefix can
      // carry `cache_control`. NOTE: claude-haiku-4-5's minimum cacheable
      // prefix is 4096 tokens and this prefix is ~250, so the marker is inert
      // today — `cache_creation_input_tokens` will read 0, with no error. It is
      // here deliberately: it costs nothing and starts paying the moment the
      // prompt grows past the floor (few-shot examples, a genre lexicon).
      // Repeat videos are already free via the `extract:` Valkey key.
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      // No `thinking` and no `output_config.effort`: on claude-haiku-4-5,
      // omitting `thinking` means no thinking (which is what a sub-second
      // extraction wants), and `effort` is a 4.6-and-later parameter that
      // errors on this model. Both come back if IDENTIFY_MODEL moves to Opus.
      output_config: {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: {
              titles: {
                type: "array",
                items: { type: "string" },
                // No `maxItems`: Anthropic's structured-output schema subset rejects it for
                // array types with a 400 (observed on claude-sonnet-5, a request-validation
                // error, so not model-specific). `parseExtraction` caps the list instead.
              },
            },
            required: ["titles"],
            additionalProperties: false,
          },
        },
      },
      messages: [{ role: "user", content: `Video title: ${meta.title}${author}` }],
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    const titles = parseExtraction(text);

    log.debug("extracted {count} title(s) from {title}", {
      count: titles.length,
      title: meta.title,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    });

    return titles;
  };
}
