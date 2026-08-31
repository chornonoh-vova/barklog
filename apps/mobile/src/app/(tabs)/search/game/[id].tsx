import { useRouter } from "expo-router";
import { useCallback } from "react";

import { GameDetailScreen } from "@/features/game/game-detail-screen";

export default function SearchGameDetail() {
  const router = useRouter();
  const openGame = useCallback((id: number) => router.push(`/search/game/${id}`), [router]);

  return <GameDetailScreen onOpenGame={openGame} />;
}
