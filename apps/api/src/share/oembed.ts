import type { ShareProviderName } from "@repo/contracts";
import * as v from "valibot";

import type { VideoRef } from "./canonicalise.js";

export interface VideoMeta {
  title: string;
  author: string | null;
}

/** The video is private, removed, or never existed. A 404 for the caller. */
export class VideoGone extends Error {
  override readonly name = "VideoGone";
}

/** The metadata step failed and may succeed later. A 502 for the caller. */
export class VideoMetaUnavailable extends Error {
  override readonly name = "VideoMetaUnavailable";
}

export const OEMBED_TIMEOUT_MS = 5_000;

/** Compile-time constants. Nothing user-supplied ever reaches this map. */
const ENDPOINTS: Record<ShareProviderName, string> = {
  youtube: "https://www.youtube.com/oembed",
  tiktok: "https://www.tiktok.com/oembed",
};

/**
 * `minLength(1)` after `trim` is not pedantry: TikTok answers 200 with a
 * blank or absent title for a removed video, and without this the pipeline
 * would send whitespace to the extraction step and pay for it.
 */
const oembedSchema = v.object({
  title: v.pipe(v.string(), v.trim(), v.minLength(1)),
  // `nullish`, not `optional`: a `null` author_name in an otherwise valid
  // 200 must not fail the whole schema and turn into a 502.
  author_name: v.nullish(v.pipe(v.string(), v.trim())),
});

export async function fetchVideoMeta(ref: VideoRef, fetchImpl: typeof fetch): Promise<VideoMeta> {
  const url = `${ENDPOINTS[ref.provider]}?url=${encodeURIComponent(ref.pageUrl)}&format=json`;

  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(OEMBED_TIMEOUT_MS),
    });
  } catch (cause) {
    throw new VideoMetaUnavailable(`${ref.provider} oEmbed did not answer`, { cause });
  }

  // Not `!response.ok`: these three mean the video is gone, which is the
  // caller's 404, while everything else is our 502.
  if (response.status === 401 || response.status === 403 || response.status === 404) {
    throw new VideoGone(`${ref.provider} oEmbed answered ${response.status}`);
  }
  if (!response.ok) {
    throw new VideoMetaUnavailable(`${ref.provider} oEmbed answered ${response.status}`);
  }

  const body: unknown = await response.json().catch(() => null);
  const parsed = v.safeParse(oembedSchema, body);
  if (!parsed.success) {
    throw new VideoMetaUnavailable(`${ref.provider} oEmbed payload did not match the schema`);
  }

  return {
    title: parsed.output.title,
    author: parsed.output.author_name || null,
  };
}
