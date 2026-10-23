import { renderHookWithProviders } from "@test/render";
import { PHONE_INSETS } from "@test/window";

import { useShelfInset } from "@/ui/use-shelf-inset";

describe("useShelfInset", () => {
  it("is the 16pt gutter where the sides have no safe area", async () => {
    const { result } = await renderHookWithProviders(() => useShelfInset());

    expect(result.current).toEqual({ paddingLeft: 16, paddingRight: 16 });
  });

  it("adds each side's safe area, such as iPhone Duo's tab sidebar", async () => {
    const { result } = await renderHookWithProviders(() => useShelfInset(), {
      insets: { ...PHONE_INSETS, left: 20, right: 60 },
    });

    expect(result.current).toEqual({ paddingLeft: 36, paddingRight: 76 });
  });
});
