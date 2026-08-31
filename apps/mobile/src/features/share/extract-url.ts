/**
 * Pure, and with no react-native in its module graph, so it tests in plain
 * Node — the same reason `features/onboarding/pages.ts` is structured this way.
 *
 * Structurally typed rather than importing expo-sharing's `ResolvedSharePayload`:
 * that would pull a native module into the test's graph for one field.
 */
export interface ResolvedPayloadLike {
  contentType?: string | null;
  contentUri?: string | null;
  value?: string | null;
}

const URL_IN_TEXT = /https:\/\/[^\s<>"']+/;

/** A url at the end of a sentence collects punctuation that is not part of it. */
const TRAILING = /[.,;:!?)\]}>'"]+$/;

function firstUrl(text: string): string | null {
  const match = URL_IN_TEXT.exec(text);
  if (match === null) return null;

  const trimmed = match[0].replace(TRAILING, "");

  // Never `""`: `useIdentifyShare` gates on `url !== null`, so an empty string
  // would pass the gate and cache under the not-yet-resolved key.
  return trimmed === "" ? null : trimmed;
}

/**
 * The three iOS activation rules produce two payload shapes: a `website`
 * carrying the link in `contentUri`, and a `text` carrying it inside `value`.
 * Everything else is ignored — the API validates the host anyway, so this only
 * has to find a candidate.
 */
export function sharedUrlFrom(payloads: readonly ResolvedPayloadLike[]): string | null {
  for (const payload of payloads) {
    if (payload.contentType === "website" && payload.contentUri) {
      const url = firstUrl(payload.contentUri);
      if (url !== null) return url;
    }

    if (payload.value) {
      const url = firstUrl(payload.value);
      if (url !== null) return url;
    }
  }

  return null;
}
