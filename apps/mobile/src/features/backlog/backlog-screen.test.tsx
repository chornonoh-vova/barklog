import { FREE_ACTIVE_SLOTS, type BacklogListResponse } from "@repo/contracts";
import { act, screen, userEvent, waitFor, within } from "@testing-library/react-native";

import { BacklogScreen } from "@/features/backlog/backlog-screen";
import { backlogItem, backlogList, me } from "@test/fixtures";
import { fakeEndpoints, renderRouterWithProviders } from "@test/render";
import { setWindow, TABLET } from "@test/window";

type HostElement = ReturnType<typeof screen.getByText>;

const routes = {
  index: () => <BacklogScreen />,
  search: () => null,
  explore: () => null,
  paywall: () => null,
  "game/[id]": () => null,
};

function renderHome(backlog = backlogList(), { premium = false, initialUrl = "/" } = {}) {
  const api = fakeEndpoints({
    listBacklog: async () => backlog,
    getMe: async () => me({ premium }),
  });
  return renderRouterWithProviders(routes, { api, initialUrl });
}

/** The list's scroll view, found from a row inside it. */
function listOf(element: HostElement): HostElement {
  let node: HostElement | null = element;
  while (node !== null && node.type !== "RCTScrollView") node = node.parent;
  if (node === null) throw new Error("not inside a scroll view");
  return node;
}

type RefreshControlProps = { refreshing: boolean; onRefresh: () => void };

const refreshControlOf = (list: HostElement) =>
  (list.props.refreshControl as { props: RefreshControlProps }).props;

/** A backlog endpoint whose later calls wait until the test lets them land. */
function deferredRefetch(first: BacklogListResponse) {
  let release: (value: BacklogListResponse) => void = () => {};
  let calls = 0;
  const listBacklog = () =>
    calls++ === 0
      ? Promise.resolve(first)
      : new Promise<BacklogListResponse>((resolve) => (release = resolve));
  return { listBacklog, release: (value: BacklogListResponse) => release(value) };
}

describe("BacklogScreen", () => {
  it("shows a spinner until the backlog loads", async () => {
    const api = fakeEndpoints({ listBacklog: () => new Promise(() => {}) });
    await renderRouterWithProviders(routes, { api });

    expect(screen.getByRole("progressbar")).toBeOnTheScreen();
  });

  it("offers a way in when the backlog is empty", async () => {
    await renderHome();

    expect(await screen.findByText("Your backlog is empty")).toBeOnTheScreen();

    await userEvent.setup().press(screen.getByRole("button", { name: "Find a Game" }));
    expect(screen).toHavePathname("/search");
  });

  it("sends an empty backlog's secondary action to Explore", async () => {
    await renderHome();

    await userEvent.setup().press(await screen.findByRole("button", { name: "Or explore games" }));
    expect(screen).toHavePathname("/explore");
  });

  it("groups games under their status with a count", async () => {
    await renderHome(backlogList(backlogItem(1, "playing"), backlogItem(2, "waiting")));

    expect(await screen.findByText("Game 1")).toBeOnTheScreen();
    expect(screen.getByText("Game 2")).toBeOnTheScreen();
    expect(screen.getAllByText("Playing").length).toBeGreaterThan(0);
  });

  it("filters to the status in ?status=, as a widget link sets it", async () => {
    await renderHome(backlogList(backlogItem(1, "playing"), backlogItem(2, "waiting")), {
      initialUrl: "/?status=waiting",
    });

    expect(await screen.findByText("Game 2")).toBeOnTheScreen();
    expect(screen.queryByText("Game 1")).not.toBeOnTheScreen();
  });

  it("shows the filter's empty state when nothing has that status", async () => {
    await renderHome(backlogList(backlogItem(1, "playing")), { initialUrl: "/?status=abandoned" });

    expect(await screen.findByText("Nothing abandoned")).toBeOnTheScreen();
  });

  it("opens a game's page on a row tap", async () => {
    await renderHome(backlogList(backlogItem(5, "playing")));

    await userEvent.setup().press(await screen.findByRole("button", { name: /^Game 5/ }));
    expect(screen).toHavePathname("/game/5");
  });

  it("counts a free user's spots and links them to the paywall", async () => {
    await renderHome(backlogList(backlogItem(1, "playing"), backlogItem(2, "completed")));

    const slots = await screen.findByText(`1 of ${FREE_ACTIVE_SLOTS} spots used`);
    expect(slots).toBeOnTheScreen();

    await userEvent.setup().press(slots);
    expect(screen).toHavePathname("/paywall");
  });

  it("shows no spots to a premium user", async () => {
    await renderHome(backlogList(backlogItem(1, "playing")), { premium: true });

    expect(await screen.findByText("Game 1")).toBeOnTheScreen();
    expect(screen.queryByText(/spots used/)).not.toBeOnTheScreen();
  });

  it("keeps the filter in ?status= when the user picks one", async () => {
    await renderHome(backlogList(backlogItem(1, "playing"), backlogItem(2, "waiting")));
    await screen.findByText("Game 1");

    const filter = screen
      .getAllByRole("radiogroup")
      .find((group) => within(group).queryByRole("radio", { name: "All" }) !== null)!;
    await userEvent.setup().press(within(filter).getByRole("radio", { name: "Waiting" }));

    expect(screen).toHaveSearchParams({ status: "waiting" });
    expect(screen.getByText("Game 2")).toBeOnTheScreen();
    expect(screen.queryByText("Game 1")).not.toBeOnTheScreen();
  });

  it("drops a widget's ?status= when the backlog is empty", async () => {
    await renderHome(backlogList(), { initialUrl: "/?status=playing" });

    expect(await screen.findByText("Your backlog is empty")).toBeOnTheScreen();
    expect(screen).toHaveSearchParams({});
  });

  it("refetches on pull-to-refresh, with the native spinner rather than the pill", async () => {
    const { listBacklog, release } = deferredRefetch(backlogList(backlogItem(1, "playing")));
    const api = fakeEndpoints({ listBacklog });
    await renderRouterWithProviders(routes, { api });
    const list = listOf(await screen.findByText("Game 1"));

    await act(async () => refreshControlOf(list).onRefresh());

    expect(api.listBacklog).toHaveBeenCalledTimes(2);
    // renderRouter runs fake timers: let React Query's batched notify land.
    await act(() => jest.advanceTimersByTimeAsync(10));
    expect(refreshControlOf(listOf(screen.getByText("Game 1"))).refreshing).toBe(true);
    expect(screen.queryByText("Updating…")).not.toBeOnTheScreen();

    await act(async () => release(backlogList(backlogItem(1, "completed"))));

    expect(await screen.findByRole("button", { name: "Game 1, Completed" })).toBeOnTheScreen();
    expect(refreshControlOf(listOf(screen.getByText("Game 1"))).refreshing).toBe(false);
  });

  it("shows the updating pill while cached data revalidates in the background", async () => {
    const { listBacklog, release } = deferredRefetch(backlogList(backlogItem(1, "playing")));
    const { queryClient } = await renderRouterWithProviders(routes, {
      api: fakeEndpoints({ listBacklog }),
    });
    await screen.findByText("Game 1");

    await act(async () => void queryClient.invalidateQueries());

    expect(await screen.findByText("Updating…")).toBeOnTheScreen();
    expect(screen.getByText("Game 1")).toBeOnTheScreen();

    await act(async () => release(backlogList(backlogItem(1, "playing"))));

    await waitFor(() => expect(screen.queryByText("Updating…")).not.toBeOnTheScreen());
  });

  it("lays games out as cards on a wide window, and as rows on a phone", async () => {
    const backlog = backlogList(backlogItem(1, "playing"), backlogItem(2, "playing"));
    await renderHome(backlog);
    const row = await screen.findByRole("button", { name: "Game 1, Playing" });
    expect(row).not.toHaveStyle({ borderRadius: 12 });

    await setWindow(TABLET);

    for (const name of ["Game 1, Playing", "Game 2, Playing"]) {
      expect(screen.getByRole("button", { name })).toHaveStyle({ borderRadius: 12 });
    }
    // Both cards sit in one grid row, under one header.
    const first = screen.getByRole("button", { name: "Game 1, Playing" });
    const second = screen.getByRole("button", { name: "Game 2, Playing" });
    expect(first.parent?.parent?.parent).toBe(second.parent?.parent?.parent);
    expect(screen.getByText("2")).toBeOnTheScreen();
  });
});
