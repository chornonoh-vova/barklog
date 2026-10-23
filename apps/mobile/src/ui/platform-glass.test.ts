import type * as ReactNative from "react-native";

import type * as PlatformGlass from "@/ui/platform-glass";

/** Loads the module fresh on a given iOS version, since it reads it once at import. */
function onIOS(version: string): typeof PlatformGlass {
  let module!: typeof PlatformGlass;
  jest.isolateModules(() => {
    const { Platform } = jest.requireActual<typeof ReactNative>("react-native");
    jest.spyOn(Platform, "Version", "get").mockReturnValue(version);
    module = jest.requireActual<typeof PlatformGlass>("@/ui/platform-glass");
  });
  return module;
}

describe("platform glass styles", () => {
  it("uses Liquid Glass on iOS 26", () => {
    expect(onIOS("26.1")).toEqual({
      GLASS_STYLE: "glass",
      GLASS_PROMINENT_STYLE: "glassProminent",
    });
  });

  it("falls back to bordered buttons on iOS 18", () => {
    expect(onIOS("18.6")).toEqual({
      GLASS_STYLE: "bordered",
      GLASS_PROMINENT_STYLE: "borderedProminent",
    });
  });
});
