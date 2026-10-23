import { renderHook } from "@testing-library/react-native";

import { useIsAccessibilitySize } from "@/ui/use-accessibility-size";
import { setWindow } from "@test/window";

describe("useIsAccessibilitySize", () => {
  it("is false at the standard text sizes", async () => {
    await setWindow({ fontScale: 1.35 });
    const { result } = await renderHook(() => useIsAccessibilitySize());

    expect(result.current).toBe(false);
  });

  it("is true at the accessibility text sizes", async () => {
    await setWindow({ fontScale: 1.65 });
    const { result } = await renderHook(() => useIsAccessibilitySize());

    expect(result.current).toBe(true);
  });

  it("follows the text size changing while the app is open", async () => {
    const { result } = await renderHook(() => useIsAccessibilitySize());
    expect(result.current).toBe(false);

    await setWindow({ fontScale: 2 });
    expect(result.current).toBe(true);

    await setWindow({ fontScale: 1 });
    expect(result.current).toBe(false);
  });
});
