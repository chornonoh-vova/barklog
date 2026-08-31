import { useIsFocused, useRouter } from "expo-router";
import { useCallback } from "react";

import { ShareSheet } from "@/features/share/share-sheet";
import { useSharedUrl } from "@/features/share/use-shared-url";

export default function SharedIndex() {
  const router = useRouter();
  const { url, isPending, error, clear } = useSharedUrl();

  /**
   * Focus, not local state: pushing the detail screen collapses the sheet, and
   * coming back re-presents it. "Wrong pick, go back" then needs no state of
   * its own.
   */
  const isFocused = useIsFocused();

  const dismiss = useCallback(() => {
    // Before `back()`: without this the payload survives in the App Group and
    // the next cold launch re-presents a share the user already dealt with.
    clear();
    router.back();
  }, [clear, router]);

  const openGame = useCallback((id: number) => router.push(`/shared/game/${id}`), [router]);

  const search = useCallback(() => {
    clear();
    // `dismissTo`, not `replace`: the sheet lives inside a modal stack, and
    // `replace` would swap the modal's own screen rather than closing it.
    router.dismissTo("/search");
  }, [clear, router]);

  return (
    <ShareSheet
      url={url}
      isPending={isPending}
      error={error}
      isPresented={isFocused}
      onSelect={openGame}
      onDismiss={dismiss}
      onSearch={search}
    />
  );
}
