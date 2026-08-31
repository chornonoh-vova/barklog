import { useRouter } from "expo-router";
import { useCallback } from "react";

import { GameDetailScreen } from "@/features/game/game-detail-screen";

export default function HomeGameDetail() {
  const router = useRouter();
  // A literal, not an interpolated base path: typed routes make `Href` a union
  // of template-literal types.
  const openGame = useCallback((id: number) => router.push(`/game/${id}`), [router]);

  return <GameDetailScreen onOpenGame={openGame} />;
}
