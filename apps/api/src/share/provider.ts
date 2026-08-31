import type { ShareProvider } from "../types.js";
import { resolveShortLink } from "./canonicalise.js";
import { createTitleExtractor } from "./extract.js";
import { fetchVideoMeta } from "./oembed.js";

/**
 * The production wiring for the three impure edges. `fetchImpl` is a parameter
 * so a future integration test can drive real canonicalisation against a
 * recorded server without reaching the internet.
 */
export function createShareProvider(
  env: { ANTHROPIC_API_KEY: string; IDENTIFY_MODEL: string },
  fetchImpl: typeof fetch = fetch,
): ShareProvider {
  return {
    resolveShortLink: (url) => resolveShortLink(url, fetchImpl),
    fetchMeta: (ref) => fetchVideoMeta(ref, fetchImpl),
    extractTitles: createTitleExtractor({
      apiKey: env.ANTHROPIC_API_KEY,
      model: env.IDENTIFY_MODEL,
    }),
  };
}
