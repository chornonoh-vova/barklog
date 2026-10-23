import { redirectSystemPath } from "@/app/+native-intent";

const redirect = (path: string) => redirectSystemPath({ path, initial: true });

describe("redirectSystemPath", () => {
  it("lands an expo-sharing intent on /shared", () => {
    expect(redirect("barklog://expo-sharing")).toBe("/shared");
    expect(redirect("barklog://expo-sharing?key=abc")).toBe("/shared");
  });

  it("maps a widget's game link into the Home stack", () => {
    expect(redirect("barklog://widget/game/7")).toBe("/(tabs)/(home)/game/7");
  });

  it("maps a widget's section link to a filtered Home", () => {
    expect(redirect("barklog://widget/home/playing")).toBe("/(tabs)/(home)?status=playing");
  });

  it("accepts the triple-slash spelling iOS hands a widget tap over in", () => {
    expect(redirect("barklog:///widget/game/7")).toBe("/(tabs)/(home)/game/7");
  });

  it("leaves a deep link it does not own untouched", () => {
    expect(redirect("barklog://game/7")).toBe("barklog://game/7");
    expect(redirect("https://barklog.app/game/7")).toBe("https://barklog.app/game/7");
  });

  it("hands back a path that is not a URL at all", () => {
    expect(redirect("/search")).toBe("/search");
  });
});
