import type { BacklogListItemWire, BacklogStatus } from "@repo/contracts";

import { useBacklogEntry } from "@/lib/api/hooks";
import { GameRow, type GameRowVariant } from "@/components/game-row";
import { BacklogRowMenu } from "@/features/backlog/backlog-row-menu";
import { confirmRemove } from "@/features/game/confirm-remove";
import { rowSubtitle, rowSubtitleSpoken } from "@/features/game/format";
import { shareGame } from "@/features/game/share-game";

/**
 * A Home row with the backlog's own menu. A status pick is a move: the
 * rating stays, and the slot check runs in `useBacklogEntry`.
 */
export function BacklogGameRow({
  entry,
  variant,
  subtitleLines,
  onPress,
}: {
  entry: BacklogListItemWire;
  variant: GameRowVariant;
  subtitleLines: number;
  onPress: (id: number) => void;
}) {
  const { move, remove } = useBacklogEntry(entry.gameId);

  const setStatus = (next: BacklogStatus) => {
    if (next === entry.status) return;

    move(next);
  };

  const askRemove = () => confirmRemove(entry.game.name, remove);

  return (
    <GameRow
      id={entry.gameId}
      title={entry.game.name}
      subtitle={rowSubtitle(entry)}
      spokenSubtitle={rowSubtitleSpoken(entry)}
      coverImageId={entry.game.coverImageId}
      variant={variant}
      subtitleLines={subtitleLines}
      onPress={onPress}
      menu={
        <BacklogRowMenu
          name={entry.game.name}
          status={entry.status}
          onStatus={setStatus}
          onShare={() => shareGame(entry.game)}
          onRemove={askRemove}
        />
      }
    />
  );
}
