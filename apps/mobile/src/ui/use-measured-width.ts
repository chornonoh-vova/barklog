import { useCallback, useState } from "react";
import { useWindowDimensions, type LayoutChangeEvent } from "react-native";

/**
 * A view's own width, for layout decisions in `columns.ts`. Starts from the
 * window so the first frame is already close (no rows-to-cards flash on iPad),
 * then follows `onLayout` — which, unlike the window, knows an open iPad
 * sidebar is taking ~320pt. Never the screen: on iPhone Duo and in iPad Split
 * View the screen says nothing about the space the app actually has.
 *
 * `fontScale` comes from the window so a Dynamic Type change re-renders, as in
 * `GameTile`.
 */
export function useMeasuredWidth() {
  const window = useWindowDimensions();
  const [measured, setMeasured] = useState<number>();

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setMeasured(event.nativeEvent.layout.width);
  }, []);

  return { width: measured ?? window.width, fontScale: window.fontScale, onLayout };
}
