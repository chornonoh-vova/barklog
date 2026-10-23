import { act, renderHook } from "@testing-library/react-native";

import { useDebounced } from "@/lib/use-debounced";

describe("useDebounced", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("starts with the value it was given", async () => {
    const { result } = await renderHook(() => useDebounced("ha", 400));

    expect(result.current).toBe("ha");
  });

  it("holds a change back until the delay has passed", async () => {
    const { result, rerender } = await renderHook(
      ({ value }: { value: string }) => useDebounced(value, 400),
      {
        initialProps: { value: "ha" },
      },
    );

    await rerender({ value: "had" });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(399);
    });
    expect(result.current).toBe("ha");

    await act(async () => {
      await jest.advanceTimersByTimeAsync(1);
    });
    expect(result.current).toBe("had");
  });

  it("restarts the wait on every change, so only the last value lands", async () => {
    const { result, rerender } = await renderHook(
      ({ value }: { value: string }) => useDebounced(value, 400),
      {
        initialProps: { value: "h" },
      },
    );

    await rerender({ value: "ha" });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(300);
    });
    await rerender({ value: "had" });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(300);
    });
    expect(result.current).toBe("h");

    await act(async () => {
      await jest.advanceTimersByTimeAsync(100);
    });
    expect(result.current).toBe("had");
  });

  it("drops a pending update when unmounted", async () => {
    const clear = jest.spyOn(globalThis, "clearTimeout");
    const { result, rerender, unmount } = await renderHook(
      ({ value }: { value: string }) => useDebounced(value, 400),
      {
        initialProps: { value: "h" },
      },
    );

    await rerender({ value: "ha" });
    await unmount();

    expect(clear).toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(400);
    expect(result.current).toBe("h");
  });
});
