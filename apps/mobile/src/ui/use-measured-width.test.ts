import { act, renderHook } from "@testing-library/react-native";
import type { LayoutChangeEvent } from "react-native";

import { useMeasuredWidth } from "@/ui/use-measured-width";
import { renderHookWithProviders } from "@test/render";
import { setWindow, TABLET } from "@test/window";

const layout = (width: number) =>
  ({ nativeEvent: { layout: { x: 0, y: 0, width, height: 800 } } }) as LayoutChangeEvent;

describe("useMeasuredWidth", () => {
  it("starts from the window's width before the view is laid out", async () => {
    await setWindow(TABLET);
    const { result } = await renderHook(() => useMeasuredWidth());

    expect(result.current.width).toBe(1366);
  });

  it("follows the view's own width once laid out, as with an open iPad sidebar", async () => {
    await setWindow(TABLET);
    const { result } = await renderHook(() => useMeasuredWidth());

    await act(async () => result.current.onLayout(layout(1046)));

    expect(result.current.width).toBe(1046);
  });

  it("tracks the window until the view is measured", async () => {
    const { result } = await renderHook(() => useMeasuredWidth());
    expect(result.current.width).toBe(393);

    await setWindow({ width: 852 });

    expect(result.current.width).toBe(852);
  });

  it("takes the side safe-area insets out, and hands them back as padding", async () => {
    await setWindow({ width: 852 });
    const { result } = await renderHookWithProviders(() => useMeasuredWidth(), {
      insets: { top: 0, right: 59, bottom: 21, left: 47 },
    });

    expect(result.current.width).toBe(852 - 47 - 59);
    expect(result.current.sideInsets).toEqual({ paddingLeft: 47, paddingRight: 59 });
  });

  it("reports the text size, and re-renders when it changes", async () => {
    const { result } = await renderHook(() => useMeasuredWidth());
    expect(result.current.fontScale).toBe(1);

    await setWindow({ fontScale: 2 });

    expect(result.current.fontScale).toBe(2);
  });

  it("keeps the same layout handler across renders", async () => {
    const { result } = await renderHook(() => useMeasuredWidth());
    const { onLayout } = result.current;

    await setWindow({ fontScale: 1.2 });

    expect(result.current.onLayout).toBe(onLayout);
  });
});
