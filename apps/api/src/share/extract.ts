import { EXTRACTED_BASES } from "@repo/contracts";
import { getLogger } from "@logtape/logtape";
import OpenAI from "openai";
import * as v from "valibot";

import type { SourceMeta, VideoMeta } from "./oembed.js";

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

// --- Task 8 ladder rung: additive until Task 9 deletes the block above and
// renames everything below onto the plain names. See task-8-amendment.md. ---

export const EXTRACT_PROMPT_VERSION_V3 = 3;

export const PASS_1_BASES = ["title", "author", "none"] as const;
export const PASS_2_BASES = ["web", "none"] as const;

const PASS_1_MAX_OUTPUT_TOKENS = 256;
/** 256 does not survive reasoning plus web-search tool-call items in the output array. */
const PASS_2_MAX_OUTPUT_TOKENS = 1024;

const CANON = `Reply with the game's canonical English title as a games database would list it, not as the source spells it. Expand abbreviations and nicknames: "RE2" is "Resident Evil 2", "BOTW" is "The Legend of Zelda: Breath of the Wild", "GTA V" is "Grand Theft Auto V".

Give up to ${MAX_GUESSES} titles, most likely first. When a title could mean an original or its remake, list both, original first. Never pad the list to reach ${MAX_GUESSES}.`;

const PASS_1_SYSTEM = `You identify which video game a shared page or video is about, from its title, its author and the site it came from.

${CANON}

Work down these tiers, stop at the first that applies, and set \`basis\` to the tier you used:
- "title": the title names or clearly implies a game.
- "author": it does not, but you recognise the author or site — a channel, a creator, a publication — and it covers a game or a small set of games. Guess those.
- "none": neither. Return no titles.

Never invent an author or site you do not recognise.`;

const PASS_2_SYSTEM = `You identify which video game a shared page or video is about. The title and author were not enough, so search the web for the URL you are given and answer from what you find.

${CANON}

Set \`basis\` to "web" when the search told you which game it is, and "none" when it did not. Never report the page's own title as if it were a game, and return "none" rather than guess.`;

function schemaFor(bases: readonly string[]) {
  return {
    type: "json_schema" as const,
    name: "game_titles",
    strict: true,
    schema: {
      type: "object",
      properties: {
        titles: { type: "array", items: { type: "string" } },
        basis: { type: "string", enum: [...bases] },
      },
      required: ["titles", "basis"],
      additionalProperties: false,
    },
  };
}

/** Same rules as `parseExtraction`, parameterised so pass 1 and pass 2 each reject the other's basis. */
export function parseExtractionFor(raw: string, allowed: readonly string[]): Extraction {
  const schema = v.object({
    titles: v.array(v.pipe(v.string(), v.trim())),
    basis: v.picklist(allowed),
  });

  const parsed = v.parse(schema, JSON.parse(raw));
  const titles = parsed.titles.filter((title) => title !== "").slice(0, MAX_GUESSES);

  if (parsed.basis === "none" || titles.length === 0) return { titles: [], basis: "none" };

  return { titles, basis: parsed.basis as Extraction["basis"] };
}

function describeSource(meta: SourceMeta): string {
  const lines = [`Title: ${meta.title}`];
  if (meta.author !== null) lines.push(`Author: ${meta.author}`);
  lines.push(`Site: ${meta.provider}`);

  return lines.join("\n");
}

export function createSourceExtractor(options: {
  apiKey: string;
  model: string;
  client?: OpenAI;
}): (meta: SourceMeta) => Promise<Extraction> {
  const client = options.client ?? new OpenAI({ apiKey: options.apiKey });

  return async function extractFromSource(meta: SourceMeta): Promise<Extraction> {
    const described = describeSource(meta);

    const first = await client.responses.create({
      model: options.model,
      instructions: PASS_1_SYSTEM,
      input: described,
      max_output_tokens: PASS_1_MAX_OUTPUT_TOKENS,
      reasoning: { effort: "none" },
      text: { format: schemaFor(PASS_1_BASES) },
    });

    const pass1 = parseExtractionFor(first.output_text, PASS_1_BASES);
    if (pass1.basis !== "none") {
      log.debug("pass 1 extracted {count} title(s)", {
        count: pass1.titles.length,
        basis: pass1.basis,
        shareId: meta.shareId,
        inputTokens: first.usage?.input_tokens,
        outputTokens: first.usage?.output_tokens,
      });

      return pass1;
    }

    // Pass 2 bills for a web search at roughly 80x pass 1's cost, so it only ever
    // runs after pass 1 admits defeat, and its failure must propagate uncached
    // rather than collapse into pass 1's `none` (that call has no try/catch).
    const second = await client.responses.create({
      model: options.model,
      instructions: PASS_2_SYSTEM,
      input: `${described}\nURL: ${meta.pageUrl}`,
      max_output_tokens: PASS_2_MAX_OUTPUT_TOKENS,
      reasoning: { effort: "low" },
      tools: [{ type: "web_search", search_context_size: "low" }],
      text: { format: schemaFor(PASS_2_BASES) },
    });

    const pass2 = parseExtractionFor(second.output_text, PASS_2_BASES);

    log.debug("pass 2 extracted {count} title(s) after searching", {
      count: pass2.titles.length,
      basis: pass2.basis,
      shareId: meta.shareId,
      pageUrl: meta.pageUrl,
      inputTokens: second.usage?.input_tokens,
      outputTokens: second.usage?.output_tokens,
    });

    return pass2;
  };
}
