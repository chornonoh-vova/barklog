import type { ShareProvider } from "../types.js";
import { createTitleExtractor } from "./extract.js";
import { fetchSourceMeta } from "./meta.js";

/** The production wiring for the impure edges. */
export function createShareProvider(env: {
  OPENAI_API_KEY: string;
  IDENTIFY_MODEL: string;
}): ShareProvider {
  return {
    model: env.IDENTIFY_MODEL,
    fetchMeta: (share) => fetchSourceMeta(share),
    extractTitles: createTitleExtractor({
      apiKey: env.OPENAI_API_KEY,
      model: env.IDENTIFY_MODEL,
    }),
  };
}
