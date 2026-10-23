import AsyncStorage from "@react-native-async-storage/async-storage";
import { screen, userEvent } from "@testing-library/react-native";

import { backlogItem, backlogList, gameDetail, gameSummary } from "@test/fixtures";

import { fakeServer, markOnboardingSeen, renderApp, requests } from "./app";

const games = (...ids: number[]) => ({ items: ids.map((id) => gameSummary({ id })) });

/** Game 7, with game 8 as its only similar game. */
const gameSeven = {
  "/api/games/7": gameDetail({ id: 7 }),
  "/api/games/7/similar": games(8),
  "/api/games/8": gameDetail({ id: 8 }),
  "/api/games/8/similar": games(),
};

beforeEach(async () => {
  await AsyncStorage.clear();
  await markOnboardingSeen();
});

afterEach(() => {
  jest.restoreAllMocks();
});

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
      "/api/games/popular": games(1),
      "/api/games/upcoming": games(2),
      "/api/games/recent": games(3),
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
