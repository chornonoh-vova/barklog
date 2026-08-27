import { useCallback, useState } from "react";

/**
 * A `Host` with `matchContents` has no React Native children, so its height
 * comes entirely from SwiftUI pushing the measured size into the shadow node's
 * Fabric state. That push is deduped against the value already in state
 * (`ExpoFabricViewObjC.dispatchSizePatch` returns `nullptr` — "no change" — to
 * cancel the commit). Reopening a screen builds a fresh shadow node whose Yoga
 * height is back to `auto`, but the state still holds the height measured the
 * first time, so the commit is cancelled and the height is never applied. The
 * host collapses to zero and the SwiftUI content draws over its neighbours.
 *
 * `onLayoutContent` fires on every mount regardless, so mirroring what it
 * reports into `minHeight` keeps a floor under the host. This never fights the
 * native path: it only clamps a collapsed node back up, and a taller
 * measurement — a larger Dynamic Type setting, say — still wins.
 */
export function useMeasuredHostHeight() {
  const [minHeight, setMinHeight] = useState<number>();

  const onLayoutContent = useCallback((event: { nativeEvent: { height: number } }) => {
    setMinHeight(event.nativeEvent.height);
  }, []);

  return { minHeight, onLayoutContent };
}
