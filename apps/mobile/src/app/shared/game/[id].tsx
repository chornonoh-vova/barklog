import { useRouter } from "expo-router";
import { useCallback } from "react";

import { GameDetailScreen } from "@/features/game/game-detail-screen";

export default function SharedGameDetail() {
  const router = useRouter();
  const openGame = useCallback((id: number) => router.push(`/shared/game/${id}`), [router]);

  return <GameDetailScreen onOpenGame={openGame} />;
}
