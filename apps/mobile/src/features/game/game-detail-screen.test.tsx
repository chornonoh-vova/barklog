import type { GameDetailResponse } from "@repo/contracts";
import { act, screen, userEvent, waitFor, within } from "@testing-library/react-native";
import { Stack } from "expo-router";
import { Alert, Share, Text } from "react-native";

import { GameDetailScreen } from "@/features/game/game-detail-screen";
import { ApiError } from "@/lib/api/errors";
import { keys } from "@/lib/api/keys";
import {
  backlogEntry,
  backlogItem,
  backlogList,
  gameDetail,
  gameList,
  gameSummary,
  me,
} from "@test/fixtures";
import { fakeEndpoints, renderRouterWithProviders, testQueryClient } from "@test/render";
import {
  ancestor,
  navigationBar,
  navigationBarItem,
  scrollViewAround,
  sidePadding,
} from "@test/queries";
import { DUO_INSETS, setWindow, TABLET, type Insets } from "@test/window";

const onOpenGame = jest.fn();

const routes = {
  // The toolbar and title are screen options, so the screen needs a stack.
  _layout: () => <Stack />,
  "game/[id]": () => <GameDetailScreen onOpenGame={onOpenGame} />,
  paywall: () => <Text>Paywall</Text>,
};

const noSimilar = async () => gameList();

/** Each `getGame` call answers with the next detail; the last one repeats. */
function renderDetail(
  details: GameDetailResponse[] = [gameDetail({ id: 7 })],
  options: { queryClient?: ReturnType<typeof testQueryClient>; insets?: Insets } = {},
) {
  let call = 0;
  const api = fakeEndpoints({
    getGame: async () => details[Math.min(call++, details.length - 1)]!,
    similarGames: noSimilar,
    upsertBacklogEntry: async (gameId, input) => backlogEntry({ gameId, status: input.status }),
    deleteBacklogEntry: async () => undefined,
  });
  return renderRouterWithProviders(routes, { initialUrl: "/game/7", api, ...options });
}

/** Every text on screen, in reading order. */
function textsInOrder(): string[] {
  const texts: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node === "string") texts.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node !== null && typeof node === "object")
      walk((node as { children: unknown }).children);
  };
  walk(screen.toJSON());
  return texts;
}

describe("GameDetailScreen", () => {
  it("loads the game in the URL and shows its page under its name", async () => {
    const { api } = await renderDetail([
      gameDetail({ id: 7, name: "Hades", screenshots: ["shot"] }),
    ]);

    expect(await screen.findByText("Summary")).toBeOnTheScreen();
    expect(api.getGame).toHaveBeenCalledWith(7);
    expect(navigationBar().title).toBe("Hades");
    for (const text of [
      "Hades",
      "A game about games.",
      "Screenshots",
      "Release",
      "Powered by IGDB",
    ]) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0);
    }
  });

  it("shows a spinner and an untitled bar, with share disabled, until the game loads", async () => {
    const api = fakeEndpoints({ getGame: () => new Promise(() => {}) });
    await renderRouterWithProviders(routes, { initialUrl: "/game/7", api });

    expect(screen.getByRole("progressbar")).toBeOnTheScreen();
    expect(navigationBar().title).toBe("");
    expect(navigationBarItem("Backlog actions")).toBeUndefined();

    const share = jest.spyOn(Share, "share");
    const button = navigationBarItem("Share game");
    expect(button?.disabled).toBe(true);
    // Disabled natively; the handler holds back too, with nothing to share yet.
    await act(async () => button?.onPress?.());
    expect(share).not.toHaveBeenCalled();
  });

  it("shows the error and retries on Try Again", async () => {
    let call = 0;
    const api = fakeEndpoints({
      getGame: async () => {
        if (call++ === 0) throw new ApiError({ status: 500, type: "about:blank", title: "Oops" });
        return gameDetail({ id: 7, name: "Hades" });
      },
      similarGames: noSimilar,
    });
    await renderRouterWithProviders(routes, { initialUrl: "/game/7", api });

    await userEvent.setup().press(await screen.findByRole("button", { name: "Try Again" }));

    expect(await screen.findByText("Summary")).toBeOnTheScreen();
    expect(api.getGame).toHaveBeenCalledTimes(2);
  });

  it("leaves out the summary when IGDB has none", async () => {
    await renderDetail([gameDetail({ id: 7, summary: null })]);

    expect(await screen.findByText("Release")).toBeOnTheScreen();
    expect(screen.queryByText("Summary")).not.toBeOnTheScreen();
  });

  it("adds the game with the status picked, then shows the refetched page", async () => {
    const { api } = await renderDetail([
      gameDetail({ id: 7 }),
      gameDetail({ id: 7, backlogEntry: backlogEntry({ gameId: 7, status: "playing" }) }),
    ]);

    const add = await screen.findByRole("menu", { name: "Add to Backlog" });
    await userEvent.setup().press(within(add).getByRole("radio", { name: "Playing" }));

    expect(api.upsertBacklogEntry).toHaveBeenCalledWith(7, { status: "playing" });
    expect(await screen.findByRole("menu", { name: "Playing" })).toBeOnTheScreen();
    expect(api.getGame).toHaveBeenCalledTimes(2);
  });

  it("rates the game, keeping its status", async () => {
    const { api } = await renderDetail([
      gameDetail({ id: 7, backlogEntry: backlogEntry({ gameId: 7, status: "completed" }) }),
      gameDetail({
        id: 7,
        backlogEntry: backlogEntry({ gameId: 7, status: "completed", rating: 9 }),
      }),
    ]);

    const rate = await screen.findByRole("menu", { name: "Rate this game" });
    await userEvent.setup().press(within(rate).getByRole("radio", { name: "9" }));

    expect(api.upsertBacklogEntry).toHaveBeenCalledWith(7, { status: "completed", rating: 9 });
    expect(await screen.findByRole("menu", { name: "Rating, 9 out of 10" })).toBeOnTheScreen();
  });

  it("opens the paywall instead of an add that would pass the free tier's spots", async () => {
    const queryClient = testQueryClient();
    queryClient.setQueryData(keys.me(), me({ premium: false }));
    queryClient.setQueryData(
      keys.backlog.list(),
      backlogList(...Array.from({ length: 10 }, (_, index) => backlogItem(index + 1, "playing"))),
    );
    const { api } = await renderDetail([gameDetail({ id: 7 })], { queryClient });

    const add = await screen.findByRole("menu", { name: "Add to Backlog" });
    await userEvent.setup().press(within(add).getByRole("radio", { name: "Waiting" }));

    expect(screen).toHavePathname("/paywall");
    expect(api.upsertBacklogEntry).not.toHaveBeenCalled();
  });

  it("lets a free user at the cap still move a game to a status that frees a spot", async () => {
    const queryClient = testQueryClient();
    queryClient.setQueryData(keys.me(), me({ premium: false }));
    queryClient.setQueryData(
      keys.backlog.list(),
      backlogList(...Array.from({ length: 10 }, (_, index) => backlogItem(index + 1, "playing"))),
    );
    const { api } = await renderDetail(
      [gameDetail({ id: 7, backlogEntry: backlogEntry({ gameId: 7, status: "playing" }) })],
      { queryClient },
    );

    const status = await screen.findByRole("menu", { name: "Playing" });
    await userEvent.setup().press(within(status).getByRole("radio", { name: "Completed" }));

    expect(api.upsertBacklogEntry).toHaveBeenCalledWith(7, { status: "completed" });
    expect(screen).toHavePathname("/game/7");
  });

  it("shares the game from the toolbar", async () => {
    const share = jest
      .spyOn(Share, "share")
      .mockResolvedValue({ action: Share.sharedAction, activityType: undefined });
    await renderDetail([gameDetail({ id: 7, name: "Hades", slug: "hades" })]);
    await screen.findByText("Summary");

    const button = navigationBarItem("Share game");
    expect(button?.disabled).toBe(false);
    await act(async () => button?.onPress?.());

    expect(share).toHaveBeenCalledWith(
      { url: "https://www.igdb.com/games/hades", title: "Hades" },
      { subject: "Hades" },
    );
  });

  it("offers backlog actions in the toolbar only for a game in the backlog", async () => {
    await renderDetail([gameDetail({ id: 7 })]);
    await screen.findByText("Summary");

    expect(navigationBarItem("Backlog actions")).toBeUndefined();
  });

  it("asks before removing from the toolbar, and removes only on the destructive button", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const { api } = await renderDetail([
      gameDetail({ id: 7, name: "Hades", backlogEntry: backlogEntry({ gameId: 7 }) }),
      gameDetail({ id: 7, name: "Hades", backlogEntry: null }),
    ]);
    await screen.findByText("Summary");

    const menu = navigationBarItem("Backlog actions");
    expect(menu?.type).toBe("menu");
    const remove = menu?.menu?.items.find((item) => item.title === "Remove from Backlog…");
    expect(remove?.destructive).toBe(true);
    await act(async () => remove?.onPress());

    expect(api.deleteBacklogEntry).not.toHaveBeenCalled();
    const [title, , buttons] = alert.mock.calls[0]!;
    expect(title).toBe("Remove “Hades”?");
    const confirm = buttons?.find((button) => button.style === "destructive");

    await act(async () => confirm?.onPress?.());

    expect(api.deleteBacklogEntry).toHaveBeenCalledWith(7);
    expect(await screen.findByRole("menu", { name: "Add to Backlog" })).toBeOnTheScreen();
    await waitFor(() => expect(navigationBarItem("Backlog actions")).toBeUndefined());
  });

  it("opens a similar game through the caller", async () => {
    const api = fakeEndpoints({
      getGame: async () => gameDetail({ id: 7 }),
      similarGames: async () => gameList(gameSummary({ id: 3, name: "Celeste" })),
    });
    await renderRouterWithProviders(routes, { initialUrl: "/game/7", api });

    await userEvent.setup().press(await screen.findByRole("button", { name: "Celeste, 2020" }));

    expect(api.similarGames).toHaveBeenCalledWith(7, expect.anything());
    expect(onOpenGame).toHaveBeenCalledWith(3);
  });

  it("stacks the facts below the screenshots on a phone", async () => {
    await renderDetail([gameDetail({ id: 7, screenshots: ["shot"] })]);
    await screen.findByText("Summary");

    const texts = textsInOrder();
    expect(texts.indexOf("Screenshots")).toBeLessThan(texts.indexOf("Release"));
  });

  it("puts the facts beside the overview, above the screenshots, on a wide window", async () => {
    await setWindow(TABLET);
    await renderDetail([gameDetail({ id: 7, screenshots: ["shot"] })]);
    await screen.findByText("Summary");

    const texts = textsInOrder();
    expect(texts.indexOf("Release")).toBeLessThan(texts.indexOf("Screenshots"));
    expect(texts.filter((text) => text === "Release")).toHaveLength(1);
  });

  it("insets the details but lets the shelves run under a tab sidebar", async () => {
    // iPhone Duo with the tab sidebar on the right.
    await renderDetail([gameDetail({ id: 7, screenshots: ["shot"] })], {
      insets: DUO_INSETS,
    });

    const shot = await screen.findByRole("button", { name: "Screenshot 1 of 1" });
    // Nothing pads the page as a whole, or every shelf would end at the sidebar.
    expect(sidePadding(scrollViewAround(shot, { horizontal: false })).content).toEqual({
      left: undefined,
      right: undefined,
    });
    expect(sidePadding(scrollViewAround(shot, { horizontal: true })).content).toEqual({
      left: 16,
      right: 76,
    });
    // The details still keep clear of it.
    const details = ancestor(
      screen.getByText("Release"),
      (node) => node.props.style?.paddingRight !== undefined,
    );
    expect(details).toHaveStyle({ paddingLeft: 0, paddingRight: 60 });
  });
});
