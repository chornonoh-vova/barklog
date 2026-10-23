import { act } from "@testing-library/react-native";
import { Dimensions, type ScaledSize } from "react-native";

/** An iPhone in portrait at the default text size. React Native's own Jest
 * setup reports `fontScale: 2`, which is an accessibility size here. */
export const PHONE: ScaledSize = { width: 393, height: 852, scale: 3, fontScale: 1 };

/** iPad landscape, wide enough for a grid and a split detail. */
export const TABLET: ScaledSize = { width: 1366, height: 1024, scale: 2, fontScale: 1 };

/** Sets what `useWindowDimensions` reports; mounted components re-render. */
export async function setWindow(overrides: Partial<ScaledSize> = {}): Promise<void> {
  const window = { ...PHONE, ...overrides };
  await act(async () => {
    Dimensions.set({ window, screen: window });
  });
}
