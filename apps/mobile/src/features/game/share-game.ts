import { Share } from "react-native";

import { gameShareContent } from "@/features/game/share";

/** One place both the detail toolbar and the Home row menu share from. */
export function shareGame(game: { slug: string; name: string }): void {
  const { content, options } = gameShareContent(game);
  void Share.share(content, options).catch(() => {});
}
