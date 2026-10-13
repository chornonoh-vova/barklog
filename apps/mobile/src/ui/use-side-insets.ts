import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Left and right safe-area padding for a vertical scroll view's content. Its
 * `contentInsetAdjustmentBehavior` pads only the scrolling axis, so without
 * this, iPhone landscape puts covers and titles behind the Dynamic Island.
 * Zero in portrait and on iPad, so those layouts are unchanged.
 */
export function useSideInsets() {
  const { left, right } = useSafeAreaInsets();

  return { paddingLeft: left, paddingRight: right };
}
