import { FREE_ACTIVE_SLOTS } from "@repo/contracts";
import { screen, userEvent } from "@testing-library/react-native";

import { BacklogScreen } from "@/features/backlog/backlog-screen";
import { backlogItem, backlogList, me } from "@test/fixtures";
import { fakeEndpoints, renderRouterWithProviders } from "@test/render";

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
});
