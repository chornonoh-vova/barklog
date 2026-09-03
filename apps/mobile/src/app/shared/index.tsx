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
   * `dismissTo` takes this `fullScreenModal` off; `dismissAll()` would only pop
   * to the first screen of the closest stack, which is this one.
   *
   * Which tab it reveals is not settled. `POP_TO` matches the root stack's
   * `(tabs)` route by name and rebuilds it as `{ ...route, params }`, carrying
   * the existing tab state across, so a warm share should land back on the tab
   * it interrupted rather than on Home. Device check 36 pins it.
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
          payload as well as navigate. Icon-only, like the `star.fill` button in
          `components/profile-toolbar.tsx`. */}
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button icon="xmark" accessibilityLabel="Close" onPress={goHome} />
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
