import { useSideInsets } from "@/ui/use-side-insets";
import { renderHookWithProviders } from "@test/render";
import { PHONE_INSETS } from "@test/window";

describe("useSideInsets", () => {
  it("pads content clear of the Dynamic Island in landscape, ignoring top and bottom", async () => {
    const { result } = await renderHookWithProviders(() => useSideInsets(), {
      insets: { top: 0, right: 59, bottom: 21, left: 59 },
    });

    expect(result.current).toEqual({ paddingLeft: 59, paddingRight: 59 });
  });

  it("adds no padding in portrait", async () => {
    const { result } = await renderHookWithProviders(() => useSideInsets(), {
      insets: PHONE_INSETS,
    });

    expect(result.current).toEqual({ paddingLeft: 0, paddingRight: 0 });
  });
});
