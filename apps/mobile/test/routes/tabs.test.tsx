import { act, screen, userEvent } from "@testing-library/react-native";
import { router } from "expo-router";

import { backlogItem, backlogList, gameDetail, gameList } from "@test/fixtures";
import { navigationBars, pressHeaderButton } from "@test/queries";

import { fakeServer, markOnboardingSeen, renderApp, requests } from "./app";

/** Game 7, with game 8 as its only similar game. */
const gameSeven = {
  "/api/games/7": gameDetail({ id: 7 }),
  "/api/games/7/similar": gameList(8),
  "/api/games/8": gameDetail({ id: 8 }),
  "/api/games/8/similar": gameList(),
};

beforeEach(() => markOnboardingSeen());

/** React Navigation reports an action no navigator took (a pop with nothing to
 * pop) as a console error in development, which LogBox shows on device. */
function expectEveryActionHandled() {
  const calls = jest.mocked(console.error).mock.calls.flat().map(String);
  expect(calls.filter((message) => message.includes("was not handled"))).toEqual([]);
}

beforeEach(() => jest.spyOn(console, "error"));

type State = { routes: { name: string; state?: State }[] };

/** The routes in Home's own stack, from the root tabs down. */
function homeStack(app: { getRouterState(): unknown }): State["routes"] {
  const find = (state: State | undefined): State | undefined => {
    for (const route of state?.routes ?? []) {
      if (route.name === "(home)") return route.state;
      const nested = find(route.state);
      if (nested !== undefined) return nested;
    }
    return undefined;
  };

  return find(app.getRouterState() as State)?.routes ?? [];
}

describe("Home tab", () => {
  it("lands on Home, showing the empty state for an empty backlog", async () => {
    fakeServer();
    await renderApp("/");

    expect(await screen.findByText("Your backlog is empty")).toBeOnTheScreen();
    expect(screen).toHavePathname("/");
    expect(screen).toHaveSegments(["(tabs)", "(home)"]);
  });

  it("lists the backlog's games", async () => {
    fakeServer({ "/api/backlog": backlogList(backlogItem(3, "playing")) });
    await renderApp("/");

    expect(await screen.findByText("Game 3")).toBeOnTheScreen();
  });

  it("opens /game/7 in Home's own stack, and a similar game in it too", async () => {
    fakeServer(gameSeven);
    await renderApp("/game/7");

    expect(await screen.findByText("A game about games.")).toBeOnTheScreen();
    expect(screen).toHavePathname("/game/7");
    expect(screen).toHaveSegments(["(tabs)", "(home)", "game", "[id]"]);

    await userEvent.setup().press(await screen.findByRole("button", { name: /^Game 8/ }));

    expect(screen).toHavePathname("/game/8");
    expect(screen).toHaveSegments(["(tabs)", "(home)", "game", "[id]"]);
  });
});

describe("Explore tab", () => {
  it("shows the feeds", async () => {
    const fetchMock = fakeServer({
      "/api/games/popular": gameList(1),
      "/api/games/upcoming": gameList(2),
      "/api/games/recent": gameList(3),
    });
    await renderApp("/explore");

    expect(await screen.findByText("Most Popular")).toBeOnTheScreen();
    expect(screen).toHavePathname("/explore");
    expect(requests(fetchMock)).toEqual(
      expect.arrayContaining([
        "GET /api/games/popular",
        "GET /api/games/upcoming",
        "GET /api/games/recent",
      ]),
    );
  });

  it("keeps /explore/game/7, and a similar game from it, inside Explore", async () => {
    fakeServer(gameSeven);
    await renderApp("/explore/game/7");

    expect(await screen.findByText("A game about games.")).toBeOnTheScreen();
    expect(screen).toHaveSegments(["(tabs)", "explore", "game", "[id]"]);

    await userEvent.setup().press(await screen.findByRole("button", { name: /^Game 8/ }));

    expect(screen).toHavePathname("/explore/game/8");
  });
});

describe("Search tab", () => {
  it("prompts for a title", async () => {
    fakeServer();
    await renderApp("/search");

    expect(await screen.findByText("Fetch a game")).toBeOnTheScreen();
    expect(screen).toHavePathname("/search");
  });

  it("keeps /search/game/7, and a similar game from it, inside Search", async () => {
    fakeServer(gameSeven);
    await renderApp("/search/game/7");

    expect(await screen.findByText("A game about games.")).toBeOnTheScreen();
    expect(screen).toHaveSegments(["(tabs)", "search", "game", "[id]"]);

    await userEvent.setup().press(await screen.findByRole("button", { name: /^Game 8/ }));

    expect(screen).toHavePathname("/search/game/8");
  });
});

describe("Profile tab", () => {
  it("shows the account actions", async () => {
    fakeServer();
    await renderApp("/profile");

    expect(await screen.findByText("Delete Account")).toBeOnTheScreen();
    expect(screen.getByText("Sign Out")).toBeOnTheScreen();
    expect(screen).toHaveSegments(["(tabs)", "profile"]);
  });

  it("opens the Clerk account screen as a modal over the tabs", async () => {
    fakeServer();
    await renderApp("/profile");
    const user = userEvent.setup();

    await user.press(await screen.findByRole("button", { name: /^Ada Lovelace/ }));

    expect(screen).toHaveSegments(["account"]);
  });

  it("leaves closing the account modal to Clerk's native dismissal", async () => {
    // Clerk's dismiss button closes the presented modal in UIKit, and the stack
    // pops it from that. A JS `back()` on top popped twice and landed on Home.
    fakeServer();
    await renderApp("/profile");
    const user = userEvent.setup();
    await user.press(await screen.findByRole("button", { name: /^Ada Lovelace/ }));

    await user.press(await screen.findByTestId("clerk-user-profile"));

    expect(screen).toHaveSegments(["account"]);
  });

  it("opens About Barklog as a modal and closes back to Profile", async () => {
    fakeServer();
    await renderApp("/profile");
    const user = userEvent.setup();

    await user.press(await screen.findByRole("button", { name: "About" }));

    expect(screen).toHaveSegments(["about"]);
    expect(await screen.findByText("Privacy Policy")).toBeOnTheScreen();

    await act(() => pressHeaderButton("Close"));

    expect(screen).toHaveSegments(["(tabs)", "profile"]);
  });

  it("opens Home filtered to the status a Stats row names", async () => {
    fakeServer({ "/api/backlog": backlogList(backlogItem(3, "playing")) });
    const app = await renderApp("/profile");
    const user = userEvent.setup();

    await user.press(await screen.findByRole("button", { name: "Playing, 1 game" }));

    expect(screen).toHaveSegments(["(tabs)", "(home)"]);
    // Switching tabs adds Expo Router's own no-animation param.
    expect(app.getSearchParams()).toMatchObject({ status: "playing" });
    expectEveryActionHandled();
  });

  it("replaces a filter Home already had with the tapped status", async () => {
    fakeServer({ "/api/backlog": backlogList(backlogItem(3, "playing")) });
    const app = await renderApp("/?status=completed");
    expect(screen).toHaveSearchParams({ status: "completed" });
    const user = userEvent.setup();

    await act(() => router.navigate("/profile"));
    await user.press(await screen.findByRole("button", { name: "Playing, 1 game" }));

    expect(screen).toHaveSegments(["(tabs)", "(home)"]);
    // Switching tabs adds Expo Router's own no-animation param.
    expect(app.getSearchParams()).toMatchObject({ status: "playing" });
    expectEveryActionHandled();
  });

  it("returns Home to its filtered list when a game was open there", async () => {
    fakeServer({ "/api/backlog": backlogList(backlogItem(3, "playing")), ...gameSeven });
    const app = await renderApp("/game/7");
    await screen.findByText("Game 7");
    const user = userEvent.setup();

    await act(() => router.navigate("/profile"));
    await user.press(await screen.findByRole("button", { name: "Playing, 1 game" }));

    expect(screen).toHaveSegments(["(tabs)", "(home)"]);
    expect(app.getSearchParams()).toMatchObject({ status: "playing" });
    // Home's stack is back to its list alone: no game, no second Home.
    expect(homeStack(app).map((route) => route.name)).toEqual(["index"]);
    expectEveryActionHandled();
  });

  it("opens Explore from an empty backlog's Stats row", async () => {
    fakeServer({
      "/api/games/popular": gameList(1),
      "/api/games/upcoming": gameList(2),
      "/api/games/recent": gameList(3),
    });
    await renderApp("/profile");
    const user = userEvent.setup();

    await user.press(await screen.findByRole("button", { name: "Find games to add" }));

    expect(screen).toHaveSegments(["(tabs)", "explore"]);
  });

  it.each([
    ["/", "Your backlog is empty"],
    ["/explore", "Most Popular"],
    ["/search", "Fetch a game"],
  ])("%s has no account button or Premium star", async (path, loaded) => {
    fakeServer({
      "/api/games/popular": gameList(1),
      "/api/games/upcoming": gameList(2),
      "/api/games/recent": gameList(3),
    });
    await renderApp(path);
    await screen.findByText(loaded);

    // By symbol, not label: the old labels no longer exist in any locale, so a
    // returning account button or star would slip past a label check.
    const symbols = (navigationBars()[0]?.items ?? []).map((item) => item.sfSymbolName);
    expect(symbols).not.toContain("person.crop.circle");
    expect(symbols).not.toContain("star");
    expect(symbols).not.toContain("star.fill");
  });
});
