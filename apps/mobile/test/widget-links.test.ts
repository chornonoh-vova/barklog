import { describe, expect, it } from "vitest";

import { WIDGET_APP_URL, widgetGameUrl, widgetRoute, widgetSectionUrl } from "@/widgets/links";

const route = (url: string) => widgetRoute(new URL(url));

describe("widget links", () => {
  it("builds game, section and app urls", () => {
    expect(widgetGameUrl(42)).toBe("barklog://widget/game/42");
    expect(widgetSectionUrl("waiting")).toBe("barklog://widget/home/waiting");
    expect(WIDGET_APP_URL).toBe("barklog://widget/home");
  });
});

describe("widgetRoute", () => {
  it("opens a game inside the Home stack", () => {
    expect(route("barklog://widget/game/42")).toBe("/(tabs)/(home)/game/42");
  });

  // Seen on device: the tap arrives with an empty host.
  it("accepts the triple-slash form iOS hands over", () => {
    expect(route("barklog:///widget/game/2")).toBe("/(tabs)/(home)/game/2");
    expect(route("barklog:///widget/home/playing")).toBe("/(tabs)/(home)?status=playing");
  });

  it("opens Home filtered to a section", () => {
    expect(route("barklog://widget/home/waiting")).toBe("/(tabs)/(home)?status=waiting");
  });

  it("opens Home for the bare app url", () => {
    expect(route("barklog://widget/home")).toBe("/(tabs)/(home)");
  });

  it("falls back to Home for an unknown status or a non-numeric id", () => {
    expect(route("barklog://widget/home/nope")).toBe("/(tabs)/(home)");
    expect(route("barklog://widget/game/abc")).toBe("/(tabs)/(home)");
  });

  it("leaves urls it does not own alone", () => {
    expect(route("barklog://expo-sharing")).toBeNull();
    expect(route("barklog://game/42")).toBeNull();
  });
});
