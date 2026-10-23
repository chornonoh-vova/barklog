import AsyncStorage from "@react-native-async-storage/async-storage";
import { fireEvent, screen, userEvent } from "@testing-library/react-native";

import { gameDetail, gameSummary } from "@test/fixtures";

import { fakeServer, markOnboardingSeen, renderApp } from "./app";

const results = (q: string) => ({ items: [gameSummary({ id: 7, name: `${q} result` })] });

const server = () =>
  fakeServer({
    "/api/games/search": ({ url }: { url: URL }) => results(url.searchParams.get("q") ?? ""),
    "/api/games/7": gameDetail({ id: 7 }),
    "/api/games/7/similar": { items: [] },
  });

/**
 * `Stack.SearchBar` renders react-native-screens' native bar, which no query
 * reaches by role or placeholder (it is not a TextInput), so it is found by its
 * placeholder prop and typed into with its own `onChangeText` event.
 */
function typeInSearchBar(text: string) {
  const [bar] = screen.container.queryAll((node) => node.props.placeholder === "Search games");
  if (bar === undefined) throw new Error("No search bar on screen");
  return fireEvent(bar, "changeText", { nativeEvent: { text } });
}

beforeEach(() => markOnboardingSeen());

describe("/search", () => {
  it("searches for what is typed into the bar, and opens a result in Search", async () => {
    const fetchMock = server();
    await renderApp("/search");
    expect(await screen.findByText("Fetch a game")).toBeOnTheScreen();

    await typeInSearchBar("hades");

    const result = await screen.findByRole("button", { name: /^hades result/ });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/games/search?q=hades"),
      expect.anything(),
    );

    await userEvent.setup().press(result);

    expect(screen).toHavePathname("/search/game/7");
    // The query that found the game becomes a recent search.
    expect(JSON.parse((await AsyncStorage.getItem("search.recents")) ?? "[]")).toEqual(["hades"]);
  });
});
