import { act, screen, userEvent } from "@testing-library/react-native";
import { useState } from "react";
import { TextInput, View } from "react-native";

import type { Endpoints } from "@/lib/api/endpoints";
import { ApiError } from "@/lib/api/errors";
import { SearchScreen } from "@/features/search/search-screen";
import { gameSummary } from "@test/fixtures";
import { fakeEndpoints, renderRouterWithProviders } from "@test/render";
import { setWindow, TABLET } from "@test/window";

type Results = Awaited<ReturnType<Endpoints["searchGames"]>>;

const results = (...names: string[]): Results =>
  ({
    items: names.map((name, i) => gameSummary({ id: i + 1, name })),
  }) as unknown as Results;

const onPickRecent = jest.fn();
const onClearRecents = jest.fn();
const onOpenResult = jest.fn();
let recents: readonly string[] = [];

/** The search bar lives in the layout's header; a plain input stands in for it. */
function SearchRoute() {
  const [query, setQuery] = useState("");
  return (
    <View style={{ flex: 1 }}>
      <TextInput accessibilityLabel="Search games" value={query} onChangeText={setQuery} />
      <SearchScreen
        query={query}
        recents={recents}
        onPickRecent={onPickRecent}
        onClearRecents={onClearRecents}
        onOpenResult={onOpenResult}
      />
    </View>
  );
}

const routes = {
  "search/index": SearchRoute,
  "search/game/[id]": () => null,
};

function renderSearch(searchGames: Endpoints["searchGames"] = async () => results()) {
  const api = fakeEndpoints({ searchGames });
  return renderRouterWithProviders(routes, { api, initialUrl: "/search" });
}

const setup = () => userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

const type = async (user: ReturnType<typeof setup>, text: string) => {
  await user.type(screen.getByLabelText("Search games"), text);
};

/** Lets the clock run, and React render whatever the timers set off. */
const elapse = (ms: number) =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });

beforeEach(() => {
  jest.useFakeTimers();
  recents = [];
});

afterEach(() => {
  jest.useRealTimers();
});

describe("SearchScreen", () => {
  it("prompts for a title before anything is typed", async () => {
    await renderSearch();

    expect(screen.getByText("Fetch a game")).toBeOnTheScreen();
    expect(screen.getByText("Type a title. Two characters is enough to start.")).toBeOnTheScreen();
  });

  it("shows recent searches instead of the prompt while the query is short", async () => {
    recents = ["hades"];
    const { api } = await renderSearch();
    const user = setup();

    await type(user, "h");

    expect(screen.getByRole("button", { name: "Search for hades" })).toBeOnTheScreen();
    await user.press(screen.getByRole("button", { name: "Search for hades" }));
    expect(onPickRecent).toHaveBeenCalledWith("hades");
    await user.press(screen.getByRole("button", { name: "Clear recent searches" }));
    expect(onClearRecents).toHaveBeenCalled();
    expect(api.searchGames).not.toHaveBeenCalled();
  });

  it("waits for typing to pause before searching, once, with the trimmed query", async () => {
    const { api } = await renderSearch(async () => results("Hades", "Hades II"));
    const user = setup();

    await type(user, "hades ");
    await elapse(399);
    expect(api.searchGames).not.toHaveBeenCalled();

    await elapse(1);
    expect(api.searchGames).toHaveBeenCalledTimes(1);
    expect(api.searchGames).toHaveBeenCalledWith({ q: "hades", limit: expect.any(Number) });

    expect(await screen.findByRole("button", { name: /^Hades II/ })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: /^Hades,|^Hades$/ })).toBeOnTheScreen();
  });

  it("says when nothing matches", async () => {
    await renderSearch();
    const user = setup();

    await type(user, "zzz");
    await elapse(400);

    expect(await screen.findByText("No games found")).toBeOnTheScreen();
    expect(screen.getByText('Nothing in the catalogue matches "zzz".')).toBeOnTheScreen();
  });

  it("shows the error with a retry when the search fails", async () => {
    const searchGames = jest
      .fn<ReturnType<Endpoints["searchGames"]>, Parameters<Endpoints["searchGames"]>>()
      .mockRejectedValueOnce(new ApiError({ status: 500, type: "about:blank", title: "Boom" }))
      .mockResolvedValue(results("Hades"));
    await renderSearch(searchGames);
    const user = setup();

    await type(user, "hades");
    await elapse(400);

    await user.press(await screen.findByRole("button", { name: "Try Again" }));
    expect(await screen.findByRole("button", { name: /^Hades/ })).toBeOnTheScreen();
  });

  it("opens a result and records the query that found it", async () => {
    await renderSearch(async () => results("Celeste"));
    const user = setup();

    await type(user, "celeste");
    await elapse(400);
    await user.press(await screen.findByRole("button", { name: /^Celeste/ }));

    expect(onOpenResult).toHaveBeenCalledWith("celeste");
    expect(screen).toHavePathname("/search/game/1");
  });

  it("credits a result to the query it was found by while the next one loads", async () => {
    let finishSecond!: (value: Results) => void;
    const searchGames = jest
      .fn<ReturnType<Endpoints["searchGames"]>, Parameters<Endpoints["searchGames"]>>()
      .mockResolvedValueOnce(results("Celeste"))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishSecond = resolve;
          }),
      );
    await renderSearch(searchGames);
    const user = setup();

    await type(user, "cel");
    await elapse(400);
    expect(await screen.findByRole("button", { name: /^Celeste/ })).toBeOnTheScreen();

    await type(user, "este");
    await elapse(400);
    expect(searchGames).toHaveBeenCalledTimes(2);

    // Still the first query's results on screen.
    await user.press(screen.getByRole("button", { name: /^Celeste/ }));
    expect(onOpenResult).toHaveBeenCalledWith("cel");
    finishSecond(results());
  });

  it("lays results out as cards on a wide window", async () => {
    await setWindow(TABLET);
    await renderSearch(async () => results("Hades", "Celeste", "Tunic"));
    const user = setup();

    await type(user, "game");
    await elapse(400);

    expect(await screen.findByRole("button", { name: /^Tunic/ })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: /^Hades/ })).toBeOnTheScreen();
  });

  it("still finds results at accessibility text sizes", async () => {
    await setWindow({ fontScale: 2 });
    await renderSearch(async () => results("Hades"));
    const user = setup();

    await type(user, "hades");
    await elapse(400);

    expect(await screen.findByRole("button", { name: /^Hades/ })).toBeOnTheScreen();
  });
});
