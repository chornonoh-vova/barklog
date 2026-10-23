import type { BacklogListResponse } from "@repo/contracts";
import { screen, userEvent, waitFor, within } from "@testing-library/react-native";
import { Alert, Share, Text } from "react-native";

import { BacklogGameRow } from "@/features/backlog/backlog-game-row";
import { useBacklog, useIsPremium } from "@/lib/api/hooks";
import { backlogEntry, backlogItem, backlogList } from "@test/fixtures";
import { fakeEndpoints, renderRouterWithProviders } from "@test/render";

const onPress = jest.fn();

/** Home's list, cut down to the rows: the backlog query stays mounted, so a
 * write's refetch reaches the screen. `/me` is read too, as Home does, so the
 * slot check knows the user is on the free tier. */
function Rows() {
  const backlog = useBacklog();
  useIsPremium();

  return (
    <>
      {backlog.data?.items.map((entry) => (
        <BacklogGameRow
          key={entry.gameId}
          entry={entry}
          variant="row"
          subtitleLines={1}
          onPress={onPress}
        />
      ))}
    </>
  );
}

const routes = { index: () => <Rows />, paywall: () => <Text>Paywall</Text> };

async function renderRows(
  ...responses: [BacklogListResponse, ...BacklogListResponse[]]
): ReturnType<typeof renderRouterWithProviders> {
  let call = 0;
  const api = fakeEndpoints({
    listBacklog: async () => responses[Math.min(call++, responses.length - 1)]!,
    upsertBacklogEntry: async (gameId, input) => backlogEntry({ gameId, status: input.status }),
    deleteBacklogEntry: async () => undefined,
  });
  const result = await renderRouterWithProviders(routes, { api });
  await screen.findByText(responses[0].items[0]!.game.name);
  return result;
}

const menuFor = (name: string) => screen.getByRole("menu", { name: `More, ${name}` });

describe("BacklogGameRow", () => {
  it("shows the game's status and rating, spoken without the star glyph", async () => {
    await renderRows(backlogList(backlogItem(1, "playing", { rating: 8 })));

    expect(screen.getByText("Playing · ★8")).toBeOnTheScreen();
    expect(
      screen.getByRole("button", { name: "Game 1, Playing, rated 8 out of 10" }),
    ).toBeOnTheScreen();
  });

  it("opens the game on a tap", async () => {
    await renderRows(backlogList(backlogItem(4, "waiting")));

    await userEvent.setup().press(screen.getByRole("button", { name: "Game 4, Waiting" }));

    expect(onPress).toHaveBeenCalledWith(4);
  });

  it("moves the game to the status picked, then shows the refetched backlog", async () => {
    const { api } = await renderRows(
      backlogList(backlogItem(1, "playing", { rating: 8 })),
      backlogList(backlogItem(1, "completed", { rating: 8 })),
    );

    await userEvent
      .setup()
      .press(within(menuFor("Game 1")).getByRole("radio", { name: "Completed" }));

    // A move leaves the rating out, so the server keeps it.
    expect(api.upsertBacklogEntry).toHaveBeenCalledWith(1, { status: "completed" });
    expect(await screen.findByText("Completed · ★8")).toBeOnTheScreen();
    expect(api.listBacklog).toHaveBeenCalledTimes(2);
  });

  it("does nothing when the game's own status is picked again", async () => {
    const { api } = await renderRows(backlogList(backlogItem(1, "playing")));

    await userEvent
      .setup()
      .press(within(menuFor("Game 1")).getByRole("radio", { name: "Playing" }));

    expect(api.upsertBacklogEntry).not.toHaveBeenCalled();
    expect(api.listBacklog).toHaveBeenCalledTimes(1);
  });

  it("opens the paywall instead of a move that would pass the free tier's spots", async () => {
    const active = Array.from({ length: 10 }, (_, index) => backlogItem(index + 1, "waiting"));
    const { api } = await renderRows(backlogList(...active, backlogItem(11, "completed")));
    // `/me` lands after the list; the slot check reads it from the cache.
    await waitFor(() => expect(api.getMe).toHaveBeenCalled());

    await userEvent
      .setup()
      .press(within(menuFor("Game 11")).getByRole("radio", { name: "Playing" }));

    expect(screen).toHavePathname("/paywall");
    expect(api.upsertBacklogEntry).not.toHaveBeenCalled();
  });

  it("shares the game's IGDB page", async () => {
    const share = jest
      .spyOn(Share, "share")
      .mockResolvedValue({ action: Share.sharedAction, activityType: undefined });
    await renderRows(backlogList(backlogItem(1, "waiting")));

    await userEvent.setup().press(within(menuFor("Game 1")).getByRole("button", { name: "Share" }));

    expect(share).toHaveBeenCalledWith(
      { url: "https://www.igdb.com/games/game-1", title: "Game 1" },
      { subject: "Game 1" },
    );
  });

  it("asks before removing, and removes only on the destructive button", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const { api } = await renderRows(
      backlogList(backlogItem(1, "waiting"), backlogItem(2, "playing")),
      backlogList(backlogItem(2, "playing")),
    );

    await userEvent
      .setup()
      .press(within(menuFor("Game 1")).getByRole("button", { name: "Remove from Backlog…" }));

    expect(api.deleteBacklogEntry).not.toHaveBeenCalled();
    const [title, message, buttons] = alert.mock.calls[0]!;
    expect(title).toBe("Remove “Game 1”?");
    expect(message).toBe("Its status and rating will be lost.");
    const confirm = buttons?.find((button) => button.style === "destructive");
    expect(confirm?.text).toBe("Remove");

    confirm?.onPress?.();

    await waitFor(() => expect(screen.queryByText("Game 1")).not.toBeOnTheScreen());
    expect(api.deleteBacklogEntry).toHaveBeenCalledWith(1);
    expect(api.listBacklog).toHaveBeenCalledTimes(2);
  });
});
