import * as v from "valibot";

import { httpsUrlOrNull } from "./coerce.js";
import registry from "./providers.json" with { type: "json" };

/**
 * providers.json is oembed.com's registry, vendored verbatim and refreshed by
 * .github/workflows/oembed-providers.yml. Every field in it is optional in
 * practice, so it is validated once at load: a malformed refresh fails the
 * process at startup, and the tests, rather than at the first share.
 */
const registrySchema = v.array(
  v.object({
    provider_name: v.optional(v.string()),
    endpoints: v.optional(
      v.array(
        v.object({
          url: v.optional(v.string()),
          schemes: v.optional(v.array(v.string())),
        }),
      ),
    ),
  }),
);

export interface ProviderEntry {
  name: string;
  endpoint: string;
  schemes: string[];
}

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
 * Only https endpoints, and only their https schemes; an endpoint left with
 * none is dropped. `{format}` is the registry's placeholder for the response
 * format, and the fetcher only reads json.
 *
 * Schemes overlap for two providers only when they share a scheme verbatim
 * (verified against the vendored registry: afreecaTV and SOOP both claim
 * `https://v.afree.ca/ST/`). Source order is preserved, so the first provider
 * to declare a scheme wins deterministically.
 */
const COMPILED: readonly { provider: ProviderEntry; schemes: Scheme[] }[] = v
  .parse(registrySchema, registry)
  .flatMap((provider) =>
    (provider.endpoints ?? []).flatMap((endpoint) => {
      const url = httpsUrlOrNull(endpoint.url?.replace("{format}", "json"));
      const schemes = (endpoint.schemes ?? []).filter((scheme) => scheme.startsWith("https://"));

      if (url === null || schemes.length === 0) return [];

      const entry = {
        name: provider.provider_name ?? new URL(url).hostname,
        endpoint: url,
        schemes,
      };
      return [{ provider: entry, schemes: schemes.map(parseScheme) }];
    }),
  );

export function matchProvider(input: string): ProviderEntry | null {
  const url = parseUrl(input);
  if (url === null) return null;

  for (const { provider, schemes } of COMPILED) {
    if (schemes.some((scheme) => schemeMatches(scheme, url))) return provider;
  }

  return null;
}
