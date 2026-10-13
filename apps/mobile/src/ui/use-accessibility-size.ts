import { useWindowDimensions } from "react-native";

import { isAccessibilitySize } from "@/ui/text-size";

/** For screens and controls, not list rows: each caller subscribes to window
 * changes, so a list reads it once and passes the result down. */
export function useIsAccessibilitySize(): boolean {
  return isAccessibilitySize(useWindowDimensions().fontScale);
}
