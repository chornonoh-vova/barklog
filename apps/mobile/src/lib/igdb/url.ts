/** The public site, not the API host or the image CDN. IGDB's terms require a
 * link back to the game's own page. */
const BASE = "https://www.igdb.com";

export function gameUrl(slug: string): string {
  return `${BASE}/games/${slug}`;
}

export function siteUrl(): string {
  return BASE;
}
