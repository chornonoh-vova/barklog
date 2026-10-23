import { PROVIDERS, type ProviderEntry } from "./providers.generated.js";

export type { ProviderEntry };

/** An oEmbed scheme split into the parts a parsed url is compared against. */
interface Scheme {
  protocol: string;
  host: string;
  path: string;
}

function parseScheme(scheme: string): Scheme {
  const separator = scheme.indexOf("://");
  const rest = scheme.slice(separator + 3);
  const slash = rest.indexOf("/");

  return {
    protocol: scheme.slice(0, separator + 1).toLowerCase(),
    host: (slash === -1 ? rest : rest.slice(0, slash)).toLowerCase(),
    // A parsed url with no path reports "/", so a scheme with none means the same.
    path: (slash === -1 ? "/" : rest.slice(slash)).toLowerCase(),
  };
}

/**
 * Glob match where `*` matches any run of characters, except that it may not
 * cross a `stop` character. A `*` that ends the pattern matches the rest of the
 * text regardless, as oEmbed writes `vimeo.com/*` to cover every video id and
 * its query.
 */
function globMatches(pattern: string, text: string, stop: string | null): boolean {
  const star = pattern.indexOf("*");
  if (star === -1) return pattern === text;
  if (!text.startsWith(pattern.slice(0, star))) return false;

  const rest = pattern.slice(star + 1);
  if (rest === "") return true;

  const tail = text.slice(star);
  for (let taken = 0; taken <= tail.length; taken++) {
    if (globMatches(rest, tail.slice(taken), stop)) return true;
    if (tail[taken] === stop) return false;
  }
  return false;
}

/**
 * The url is parsed first, and the host and the path are matched separately.
 * A parsed hostname cannot hold `/`, `\`, `?`, `#` or `@`, so no part of the
 * path, query, fragment or credentials can pass for a provider's host:
 * `https://evil.test?.youtube.com/watch` has host `evil.test` and is refused,
 * as is `https://www.youtube.com@evil.test/watch`.
 *
 * - A host wildcard covers one or more labels: `*.flickr.com` claims
 *   `www.flickr.com` but not `flickr.com`.
 * - A path wildcard stays within one segment, except at the end of the scheme,
 *   where it also covers the query.
 * - Credentials or a non-default port mean the url is not a plain link to the
 *   provider's page, so it matches nothing.
 */
function schemeMatches(scheme: Scheme, url: URL): boolean {
  if (url.protocol !== scheme.protocol) return false;
  if (!globMatches(scheme.host, url.hostname, null)) return false;

  // Everything after the origin, from the serialised url: `search` reports an
  // empty query as "", which would drop the `?` a scheme like `dashboard?*` has.
  return globMatches(scheme.path, url.href.slice(url.origin.length).toLowerCase(), "/");
}

function parseUrl(input: string): URL | null {
  if (!URL.canParse(input)) return null;

  const url = new URL(input);
  if (url.username !== "" || url.password !== "" || url.port !== "") return null;

  return url;
}

/** One scheme against one url; for tests of the matching rules. */
export function matchesScheme(scheme: string, url: string): boolean {
  const parsed = parseUrl(url);
  return parsed !== null && schemeMatches(parseScheme(scheme), parsed);
}

/**
 * Schemes overlap for two providers only when they share a scheme verbatim
 * (verified against the current snapshot: afreecaTV and SOOP both claim
 * `https://v.afree.ca/ST/`). `PROVIDERS` preserves source order, so the
 * first provider to declare a scheme wins deterministically.
 */
const COMPILED: readonly { provider: ProviderEntry; schemes: Scheme[] }[] = PROVIDERS.map(
  (provider) => ({ provider, schemes: provider.schemes.map(parseScheme) }),
);

export function matchProvider(input: string): ProviderEntry | null {
  const url = parseUrl(input);
  if (url === null) return null;

  for (const { provider, schemes } of COMPILED) {
    if (schemes.some((scheme) => schemeMatches(scheme, url))) return provider;
  }

  return null;
}
