import AsyncStorage from "@react-native-async-storage/async-storage";
import { screen, userEvent } from "@testing-library/react-native";

import { gameDetail, gameSummary } from "@test/fixtures";

import { fakeServer, markOnboardingSeen, renderApp } from "./app";

const results = (q: string) => ({ items: [gameSummary({ id: 7, name: `${q} result` })] });

const server = () =>
  fakeServer({
    "/api/games/search": ({ url }: { url: URL }) => results(url.searchParams.get("q") ?? ""),
    "/api/games/7": gameDetail({ id: 7 }),
    "/api/games/7/similar": { items: [] },
  });

// Its own file: the recents store is module state, which a search recorded by
// another test in the same file would already have filled.
beforeEach(() => markOnboardingSeen());

describe("/search recents", () => {
  it("searches again for a recent search when it is picked", async () => {
    await AsyncStorage.setItem("search.recents", JSON.stringify(["celeste"]));
    server();
    await renderApp("/search");

    await userEvent
      .setup()
      .press(await screen.findByRole("button", { name: "Search for celeste" }));

    expect(await screen.findByRole("button", { name: /^celeste result/ })).toBeOnTheScreen();
  });
});
