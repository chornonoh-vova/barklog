import { Stack, useRouter } from "expo-router";
import { useCallback } from "react";

import { ShareScreen } from "@/features/share/share-screen";
import { useSharedUrl } from "@/features/share/use-shared-url";

export default function SharedIndex() {
  const router = useRouter();
  const { url, isPending, error, clear } = useSharedUrl();

  /**
   * `clear()` before every exit: without it the payload survives in the App
   * Group and the next cold launch re-presents a share the user already dealt
   * with.
   *
   * `dismissTo`, per the v57 router docs, dismisses screens until the href is
   * reached — which takes this `fullScreenModal` off. `dismissAll()` would pop
   * to the first screen of the closest stack, which is this one, and `back()`
   * would return to whichever tab the share interrupted rather than home.
   */
  const goHome = useCallback(() => {
    clear();
    router.dismissTo("/");
  }, [clear, router]);

  const search = useCallback(() => {
    clear();
    router.dismissTo("/search");
  }, [clear, router]);

  const openGame = useCallback((id: number) => router.push(`/shared/game/${id}`), [router]);

  return (
    <>
      <Stack.Title large>Shared</Stack.Title>

      {/* A toolbar button, not `Stack.Screen.BackButton`: this is the root of a
          modal with nothing behind it to pop to, and leaving needs to clear the
          payload as well as navigate. */}
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button
          icon="chevron.left"
          accessibilityLabel="Back to home"
          onPress={goHome}
        >
          Home
        </Stack.Toolbar.Button>
      </Stack.Toolbar>

      <ShareScreen
        url={url}
        isPending={isPending}
        error={error}
        onSelect={openGame}
        onGoHome={goHome}
        onSearch={search}
      />
    </>
  );
}
