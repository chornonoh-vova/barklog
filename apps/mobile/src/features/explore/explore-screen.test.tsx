import { SEARCH_LIMIT_MAX, type GameFeed, type GameListResponse } from "@repo/contracts";
import { act, screen, userEvent } from "@testing-library/react-native";

import { ExploreScreen } from "@/features/explore/explore-screen";
import { ApiError } from "@/lib/api/errors";
import { gameSummary } from "@test/fixtures";
import { fakeEndpoints, renderRouterWithProviders } from "@test/render";
import { scrollViewAround } from "@test/queries";

type HostElement = ReturnType<typeof screen.getByText>;

const routes = {
  "explore/index": () => <ExploreScreen />,
  "explore/game/[id]": () => null,
};

type Feeds = Partial<Record<GameFeed, () => Promise<GameListResponse>>>;

const list = (...ids: number[]): GameListResponse =>
  ({ items: ids.map((id) => gameSummary({ id })) }) as GameListResponse;

const serverError = () =>
  Promise.reject(new ApiError({ status: 500, type: "about:blank", title: "Server error" }));

function renderExplore(feeds: Feeds) {
  const api = fakeEndpoints({
    gameFeed: (feed) => (feeds[feed] ?? (async () => list()))(),
  });
  return renderRouterWithProviders(routes, { api, initialUrl: "/explore" });
}

/** The screen's scroll view, found from something inside it. */
const scrollViewOf = (element: HostElement) => scrollViewAround(element, { horizontal: false });

describe("ExploreScreen", () => {
  it("shows a spinner while the feeds load", async () => {
    await renderExplore({
      popular: () => new Promise(() => {}),
      upcoming: () => new Promise(() => {}),
      recent: () => new Promise(() => {}),
    });

    expect(screen.getByRole("progressbar")).toBeOnTheScreen();
  });

  it("asks each feed for as many games as the API serves", async () => {
    const { api } = await renderExplore({ popular: async () => list(1) });
    await screen.findByText("Most Popular");

    for (const feed of ["popular", "upcoming", "recent"]) {
      expect(api.gameFeed).toHaveBeenCalledWith(feed, { limit: SEARCH_LIMIT_MAX });
    }
  });

  it("shows a shelf per feed with games, in order, skipping empty ones", async () => {
    await renderExplore({ popular: async () => list(1, 2), recent: async () => list(3) });

    expect(await screen.findByText("Most Popular")).toBeOnTheScreen();
    expect(screen.getByText("Recently Released")).toBeOnTheScreen();
    expect(screen.queryByText("Upcoming")).not.toBeOnTheScreen();
    for (const name of ["Game 1, 2020", "Game 2, 2020", "Game 3, 2020"]) {
      expect(screen.getByRole("button", { name })).toBeOnTheScreen();
    }
  });

  it("keeps the shelves that loaded when another feed fails", async () => {
    await renderExplore({ popular: async () => list(1), upcoming: serverError });

    expect(await screen.findByText("Most Popular")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Try Again" })).not.toBeOnTheScreen();
  });

  it("opens a game inside the Explore tab", async () => {
    await renderExplore({ upcoming: async () => list(9) });

    await userEvent.setup().press(await screen.findByRole("button", { name: "Game 9, 2020" }));

    expect(screen).toHavePathname("/explore/game/9");
  });

  it("explores an empty catalogue with its own empty state", async () => {
    await renderExplore({});

    expect(await screen.findByText("Nothing to sniff out yet")).toBeOnTheScreen();
    expect(
      screen.getByText("The catalogue is still syncing. Check back shortly."),
    ).toBeOnTheScreen();
  });

  it("shows the error when nothing loads, and retries every feed on Try Again", async () => {
    const { api } = await renderExplore({
      popular: serverError,
      upcoming: serverError,
      recent: serverError,
    });

    const retry = await screen.findByRole("button", { name: "Try Again" });
    expect(api.gameFeed).toHaveBeenCalledTimes(3);
    api.gameFeed.mockImplementation(async () => list(1));

    await userEvent.setup().press(retry);

    expect(await screen.findByText("Most Popular")).toBeOnTheScreen();
    expect(api.gameFeed).toHaveBeenCalledTimes(6);
  });

  it("refetches every feed on pull-to-refresh", async () => {
    const { api } = await renderExplore({ popular: async () => list(1) });
    const scrollView = scrollViewOf(await screen.findByText("Most Popular"));
    const refreshControl = scrollView.props.refreshControl as {
      props: { refreshing: boolean; onRefresh: () => void };
    };
    expect(refreshControl.props.refreshing).toBe(false);

    await act(async () => refreshControl.props.onRefresh());

    expect(api.gameFeed).toHaveBeenCalledTimes(6);
  });
});
