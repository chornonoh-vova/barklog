/**
 * The public site, not the API host `packages/igdb` talks to or the image CDN in
 * `igdb-image.ts`. IGDB's terms require the data to be credited with a link back
 * to the game's own page, and `slug` is mirrored beside every game (see
 * `packages/db/src/schema/mirror.ts`) so that link never has to be guessed at by
 * slugifying a display name.
 */
const BASE = "https://www.igdb.com";

export function gameUrl(slug: string): string {
  return `${BASE}/games/${slug}`;
}
