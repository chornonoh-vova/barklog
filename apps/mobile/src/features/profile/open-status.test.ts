import { homeHasPushedScreens } from "./open-status";

const tabs = (home: { routes: { name: string }[] } | undefined) => ({
  routes: [
    {
      name: "(tabs)",
      state: { routes: [{ name: "(home)", state: home }, { name: "profile" }] },
    },
  ],
});

describe("homeHasPushedScreens", () => {
  it("is false when Home shows only its list", () => {
    expect(homeHasPushedScreens(tabs({ routes: [{ name: "index" }] }))).toBe(false);
  });

  it("is true when a game is open over Home's list", () => {
    expect(homeHasPushedScreens(tabs({ routes: [{ name: "index" }, { name: "game/[id]" }] }))).toBe(
      true,
    );
  });

  it("is false before Home has been visited", () => {
    expect(homeHasPushedScreens(tabs(undefined))).toBe(false);
  });

  it("is false without any state", () => {
    expect(homeHasPushedScreens(undefined)).toBe(false);
  });
});
