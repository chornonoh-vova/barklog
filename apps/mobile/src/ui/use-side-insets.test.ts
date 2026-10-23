import { renderHook } from "@testing-library/react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useSideInsets } from "@/ui/use-side-insets";

jest.mock("react-native-safe-area-context", () => ({
  ...jest.requireActual<object>("react-native-safe-area-context"),
  useSafeAreaInsets: jest.fn(),
}));

describe("useSideInsets", () => {
  it("pads content clear of the Dynamic Island in landscape, ignoring top and bottom", async () => {
    jest.mocked(useSafeAreaInsets).mockReturnValue({ top: 0, right: 59, bottom: 21, left: 59 });
    const { result } = await renderHook(() => useSideInsets());

    expect(result.current).toEqual({ paddingLeft: 59, paddingRight: 59 });
  });

  it("adds no padding in portrait", async () => {
    jest.mocked(useSafeAreaInsets).mockReturnValue({ top: 59, right: 0, bottom: 34, left: 0 });
    const { result } = await renderHook(() => useSideInsets());

    expect(result.current).toEqual({ paddingLeft: 0, paddingRight: 0 });
  });
});
