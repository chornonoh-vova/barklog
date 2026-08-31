import { useRouter } from "expo-router";
import { useCallback } from "react";

import { GameDetailScreen } from "@/features/game/game-detail-screen";

export default function ExploreGameDetail() {
  const router = useRouter();
  const openGame = useCallback((id: number) => router.push(`/explore/game/${id}`), [router]);

  return <GameDetailScreen onOpenGame={openGame} />;
}
