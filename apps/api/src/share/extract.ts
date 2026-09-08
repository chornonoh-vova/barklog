import type { EXTRACTED_BASES } from "@repo/contracts";
import { getLogger } from "@logtape/logtape";
import OpenAI from "openai";
import * as v from "valibot";

import type { SourceMeta } from "./oembed.js";

const log = getLogger(["api", "share"]);

/** Each guess costs one mirror search, so the fan-out is bounded here. */
export const MAX_GUESSES = 3;

export interface Extraction {
  titles: string[];
  basis: (typeof EXTRACTED_BASES)[number];
}

/** Bump on any prompt edit: it is part of the cache key. */
export const EXTRACT_PROMPT_VERSION = 3;

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

/**
 * Separated from the API call so the parsing rules are testable without a
 * network or a key. Throws on anything unexpected: the caller fails soft, and
 * a throw is what keeps the bad answer out of the cache. Parameterised by
 * `allowed` so pass 1 and pass 2 each reject the other's basis.
 */
export function parseExtraction(raw: string, allowed: readonly string[]): Extraction {
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

/**
 * The SDK defaults to 2 retries and a 10-minute timeout: one logical pass 2
 * could otherwise issue three web-search requests, each billed even if the
 * caller gives up first. Separated out so the settings are assertable
 * without a network call. Pass 2 additionally zeroes its own retry budget
 * where it is used below, since a retried search bills twice for one answer.
 */
export function createOpenAIClient(apiKey: string): OpenAI {
  return new OpenAI({ apiKey, timeout: 20_000, maxRetries: 1 });
}

export function createTitleExtractor(options: {
  apiKey: string;
  model: string;
  client?: OpenAI;
}): (meta: SourceMeta) => Promise<Extraction> {
  const client = options.client ?? createOpenAIClient(options.apiKey);

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

    const pass1 = parseExtraction(first.output_text, PASS_1_BASES);
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
    const second = await client.responses.create(
      {
        model: options.model,
        instructions: PASS_2_SYSTEM,
        input: `${described}\nURL: ${meta.pageUrl}`,
        max_output_tokens: PASS_2_MAX_OUTPUT_TOKENS,
        reasoning: { effort: "low" },
        tools: [{ type: "web_search", search_context_size: "low" }],
        text: { format: schemaFor(PASS_2_BASES) },
      },
      // No retries on this specific call: it is the one that already paid
      // for a web search, so a retry would bill for a second one.
      { maxRetries: 0 },
    );

    const pass2 = parseExtraction(second.output_text, PASS_2_BASES);

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
