import type { BacklogListItemWire, BacklogStatus } from "@repo/contracts";
import { useRouter } from "expo-router";

import {
  useBacklogStats,
  useDeleteBacklogEntry,
  usePremium,
  useUpsertBacklogEntry,
} from "@/api/hooks";
import { GameRow, type GameRowVariant } from "@/components/game-row";
import { SwipeToRemove } from "@/components/swipe-to-remove";
import { BacklogRowMenu } from "@/features/backlog/backlog-row-menu";
import { activeSlotsUsed } from "@/features/backlog/slots";
import { confirmRemove } from "@/features/game/confirm-remove";
import { rowSubtitle, rowSubtitleSpoken } from "@/features/game/format";
import { shareGame } from "@/features/game/share-game";
import { wouldExceedSlots } from "@/features/paywall/should-offer-paywall";

/**
 * A Home row with the backlog's own menu. Home is the one list that knows each
 * game's entry, rating included — so it is the one list that may change status
 * without wiping the rating (spec §3.4).
 */
export function BacklogGameRow({
  entry,
  variant,
  onPress,
}: {
  entry: BacklogListItemWire;
  variant: GameRowVariant;
  onPress: (id: number) => void;
}) {
  const upsert = useUpsertBacklogEntry(entry.gameId);
  const remove = useDeleteBacklogEntry(entry.gameId);
  const premium = usePremium();
  const stats = useBacklogStats();
  const router = useRouter();
  const activeCount = stats.data === undefined ? undefined : activeSlotsUsed(stats.data);

  const setStatus = (next: BacklogStatus) => {
    if (next === entry.status) return;

    if (wouldExceedSlots({ premium, activeCount, from: entry.status, to: next })) {
      router.push("/paywall");
      return;
    }

    upsert.mutate({ status: next, rating: entry.rating });
  };

  const askRemove = () => confirmRemove(entry.game.name, () => remove.mutate());

  const row = (
    <GameRow
      id={entry.gameId}
      title={entry.game.name}
      subtitle={rowSubtitle(entry)}
      spokenSubtitle={rowSubtitleSpoken(entry)}
      coverImageId={entry.game.coverImageId}
      variant={variant}
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

  // Cards get no swipe: swiping cards in a grid is not an iOS pattern (spec §3.5).
  return variant === "row" ? <SwipeToRemove onRemove={askRemove}>{row}</SwipeToRemove> : row;
}
