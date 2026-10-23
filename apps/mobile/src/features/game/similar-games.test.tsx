import { SIMILAR_LIMIT_DEFAULT, type GameListResponse } from "@repo/contracts";
import { screen, userEvent, waitFor } from "@testing-library/react-native";

import { SimilarGames } from "@/features/game/similar-games";
import { gameList } from "@test/fixtures";
import { shelfInsets } from "@test/queries";
import { fakeEndpoints, renderWithProviders } from "@test/render";
import { DUO_INSETS } from "@test/window";

function renderSimilar(similarGames: () => Promise<GameListResponse>, onPressGame = jest.fn()) {
  const api = fakeEndpoints({ similarGames });
  return renderWithProviders(<SimilarGames gameId={7} onPressGame={onPressGame} />, { api });
}

describe("SimilarGames", () => {
  it("asks for the game's similar games and shows them", async () => {
    const { api } = await renderSimilar(async () => gameList(2, 3));

    expect(await screen.findByText("Similar Games")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Game 2, 2020" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Game 3, 2020" })).toBeOnTheScreen();
    expect(api.similarGames).toHaveBeenCalledWith(7, { limit: SIMILAR_LIMIT_DEFAULT });
  });

  it("reports the game pressed", async () => {
    const onPressGame = jest.fn();
    await renderSimilar(async () => gameList(3), onPressGame);

    await userEvent.setup().press(await screen.findByRole("button", { name: "Game 3, 2020" }));

    expect(onPressGame).toHaveBeenCalledWith(3);
  });

  it("stays out of the way while loading", async () => {
    await renderSimilar(() => new Promise(() => {}));

    expect(screen.queryByText("Similar Games")).not.toBeOnTheScreen();
  });

  it.each([
    ["has no similar games", async () => gameList()],
    ["fails", () => Promise.reject(new Error("offline"))],
  ])("renders nothing when the game %s", async (_, similarGames) => {
    const { queryClient } = await renderSimilar(similarGames);

    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
    expect(screen.queryByText("Similar Games")).not.toBeOnTheScreen();
  });

  it("runs under the side safe areas, so covers scroll beneath a tab sidebar", async () => {
    const api = fakeEndpoints({ similarGames: async () => gameList(2, 3) });
    await renderWithProviders(<SimilarGames gameId={7} onPressGame={jest.fn()} />, {
      api,
      insets: DUO_INSETS,
    });

    const game = await screen.findByRole("button", { name: "Game 2, 2020" });
    expect(shelfInsets(game, "Similar Games")).toEqual({
      frame: { left: undefined, right: undefined },
      content: { left: 16, right: 76 },
      title: { left: 16, right: 76 },
    });
  });
});
