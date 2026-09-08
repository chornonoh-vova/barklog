import { PROVIDERS, type ProviderEntry } from "./providers.generated.js";

export type { ProviderEntry };

const REGEXP_SPECIAL = /[.*+?^${}()|[\]\\]/g;

/**
 * `*` matches any run of characters that does not contain `/`, so it cannot
 * cross the boundary between the host and the path (or between two path
 * segments). Without that restriction, `*.youtube.com/watch*` would match
 * `https://evil.com/x.youtube.com/watch?v=1`: a plain `.*` lets the host
 * wildcard swallow `evil.com/x` and pick up `.youtube.com/watch` on the far
 * side of the `/`. A `*` that is the last character of the scheme is the one
 * exception: it also swallows the query string, matching how oEmbed schemes
 * such as `vimeo.com/*` are written to cover every video id and its query
 * params.
 */
export function schemeToRegExp(scheme: string): RegExp {
  const trailingWildcard = scheme.endsWith("*");
  const anchored = trailingWildcard ? scheme.slice(0, -1) : scheme;

  const body = anchored
    .split("*")
    .map((literal) => literal.replace(REGEXP_SPECIAL, "\\$&"))
    .join("[^/]*");

  return new RegExp(`^${body}${trailingWildcard ? ".*" : ""}$`, "i");
}

/**
 * Schemes overlap for two providers only when they share a scheme verbatim
 * (verified against the current snapshot: afreecaTV and SOOP both claim
 * `https://v.afree.ca/ST/`). `PROVIDERS` preserves source order, so the
 * first provider to declare a scheme wins deterministically.
 */
const COMPILED: readonly { provider: ProviderEntry; patterns: RegExp[] }[] = PROVIDERS.map(
  (provider) => ({
    provider,
    patterns: provider.schemes.map(schemeToRegExp),
  }),
);

export function matchProvider(url: string): ProviderEntry | null {
  for (const { provider, patterns } of COMPILED) {
    if (patterns.some((pattern) => pattern.test(url))) return provider;
  }

  return null;
}
