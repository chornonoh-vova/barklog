import { gameUrl } from "@/igdb-url";

/** The name is passed twice because the platforms read it from different
 * places: iOS drops `content.title` and takes Mail's subject from
 * `options.subject`, Android has no `subject` and reads `content.title`. */
export function gameShareContent(game: { slug: string; name: string }): {
  content: { url: string; title: string };
  options: { subject: string };
} {
  return {
    content: { url: gameUrl(game.slug), title: game.name },
    options: { subject: game.name },
  };
}
