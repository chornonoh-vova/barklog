import type { ShareProvider } from "../types.js";
import { resolveShortLink } from "./canonicalise.js";
import { createTitleExtractor } from "./extract.js";
import { fetchVideoMeta } from "./oembed.js";

/** The production wiring for the three impure edges. */
export function createShareProvider(env: {
  OPENAI_API_KEY: string;
  IDENTIFY_MODEL: string;
}): ShareProvider {
  return {
    model: env.IDENTIFY_MODEL,
    resolveShortLink: (url) => resolveShortLink(url, fetch),
    fetchMeta: (ref) => fetchVideoMeta(ref, fetch),
    extractTitles: createTitleExtractor({
      apiKey: env.OPENAI_API_KEY,
      model: env.IDENTIFY_MODEL,
    }),
  };
}
