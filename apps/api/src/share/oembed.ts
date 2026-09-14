import * as v from "valibot";

import { httpsUrlOrNull, toPositiveInt } from "./coerce.js";

import type { LookupFn } from "./safe-fetch.js";
import { safeFetch } from "./safe-fetch.js";

export const OEMBED_MAX_BYTES = 65_536;

/** The video or page is private, removed, or never existed. A 404 for the caller. */
export class SourceGone extends Error {
  override readonly name = "SourceGone";
}

/** This rung failed; a later one in the ladder may still succeed. */
export class SourceUnavailable extends Error {
  override readonly name = "SourceUnavailable";
}

export interface SourceMeta {
  title: string;
  author: string | null;
  provider: string;
  pageUrl: string;
  shareId: string;
  /** Post-redirect provider-native id, for the two hand-rolled hosts. Logs only. */
  sourceId: string | null;
  thumbnailUrl: string | null;
  thumbnailWidth: number | null;
  thumbnailHeight: number | null;
}

const oembedSchema = v.object({
  /**
   * `minLength(1)` after `trim`: TikTok answers 200 with a blank title for a
   * removed video, and without this the ladder would report whitespace as a
   * usable result instead of falling through to the next rung.
   */
  title: v.pipe(v.string(), v.trim(), v.minLength(1)),
  author_name: v.nullish(v.pipe(v.string(), v.trim())),
  provider_name: v.nullish(v.pipe(v.string(), v.trim())),
  thumbnail_url: v.optional(v.unknown()),
  thumbnail_width: v.optional(v.unknown()),
  thumbnail_height: v.optional(v.unknown()),
});

export async function fetchOembed(
  endpoint: string,
  url: string,
  deadline: number,
  fetchImpl?: typeof fetch,
  lookup?: LookupFn,
): Promise<Omit<SourceMeta, "shareId" | "sourceId">> {
  const target = `${endpoint}${endpoint.includes("?") ? "&" : "?"}url=${encodeURIComponent(url)}&format=json`;

  let response;
  try {
    response = await safeFetch(target, {
      allow: ["application/json"],
      maxBytes: OEMBED_MAX_BYTES,
      deadline,
      fetchImpl,
      lookup,
    });
  } catch (cause) {
    throw new SourceUnavailable("oEmbed did not answer", { cause });
  }

  // Checked ahead of the general failure range below: these three mean the
  // source is gone, which is terminal, while every other failure may still
  // resolve on a later rung.
  if (response.status === 401 || response.status === 403 || response.status === 404) {
    throw new SourceGone(`oEmbed answered ${response.status}`);
  }
  if (response.status < 200 || response.status >= 300) {
    throw new SourceUnavailable(`oEmbed answered ${response.status}`);
  }

  let body: unknown;
  try {
    body = JSON.parse(response.body);
  } catch {
    throw new SourceUnavailable("oEmbed payload was not json");
  }

  const parsed = v.safeParse(oembedSchema, body);
  if (!parsed.success) throw new SourceUnavailable("oEmbed payload did not match the schema");

  const thumbnailUrl = httpsUrlOrNull(parsed.output.thumbnail_url);

  return {
    title: parsed.output.title,
    author: parsed.output.author_name || null,
    provider: parsed.output.provider_name || new URL(url).hostname,
    pageUrl: url,
    thumbnailUrl,
    thumbnailWidth: thumbnailUrl === null ? null : toPositiveInt(parsed.output.thumbnail_width),
    thumbnailHeight: thumbnailUrl === null ? null : toPositiveInt(parsed.output.thumbnail_height),
  };
}
