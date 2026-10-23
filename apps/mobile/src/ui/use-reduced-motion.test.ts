import { act, renderHook, waitFor } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";

import type * as ReducedMotion from "@/ui/use-reduced-motion";

// The module reads and subscribes to Reduce Motion once, on import, so the
// spies go in before it loads and the listener it registered is kept here.
let useImageTransition: typeof ReducedMotion.useImageTransition;
let reduceMotionChanged: (enabled: boolean) => void;

beforeAll(() => {
  jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
  const addEventListener = jest.spyOn(AccessibilityInfo, "addEventListener");

  ({ useImageTransition } = jest.requireActual<typeof ReducedMotion>("@/ui/use-reduced-motion"));

  const [, listener] = addEventListener.mock.calls.find(
    ([event]) => event === "reduceMotionChanged",
  )!;
  reduceMotionChanged = listener as (enabled: boolean) => void;
});

// In order: the first test sees the value read at launch.
describe("useImageTransition", () => {
  it("drops the fade when Reduce Motion is already on at launch", async () => {
    const { result } = await renderHook(() => useImageTransition());

    await waitFor(() => expect(result.current).toBe(0));
  });

  it("follows Reduce Motion being switched while the app runs", async () => {
    const { result } = await renderHook(() => useImageTransition());

    await act(async () => reduceMotionChanged(false));
    expect(result.current).toBe(150);

    await act(async () => reduceMotionChanged(true));
    expect(result.current).toBe(0);
  });

  it("keeps the same value when the setting reports no change", async () => {
    const renders = jest.fn();
    const { result } = await renderHook(() => {
      renders();
      return useImageTransition();
    });
    const before = renders.mock.calls.length;

    await act(async () => reduceMotionChanged(true));

    expect(result.current).toBe(0);
    expect(renders).toHaveBeenCalledTimes(before);
  });

  it("stops updating a hook once it unmounts", async () => {
    const { result, unmount } = await renderHook(() => useImageTransition());
    await unmount();

    await act(async () => reduceMotionChanged(false));

    expect(result.current).toBe(0);
  });
});
