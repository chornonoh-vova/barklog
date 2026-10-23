import { screen, userEvent } from "@testing-library/react-native";

import { GameShelf } from "@/features/explore/game-shelf";
import { toColumns } from "@/features/explore/shelves";
import { gameSummary } from "@test/fixtures";
import { shelfInsets } from "@test/queries";
import { renderWithProviders } from "@test/render";
import { DUO_INSETS } from "@test/window";

const shelf = {
  feed: "popular" as const,
  title: "Most Popular",
  columns: toColumns([
    gameSummary({ id: 1, name: "Hades" }),
    gameSummary({ id: 2, name: "Celeste", firstReleaseDate: "2018-01-25T00:00:00.000Z" }),
    gameSummary({ id: 3, name: "Unreleased", firstReleaseDate: null }),
  ]),
};

describe("GameShelf", () => {
  it("titles the shelf and shows every game with its release year", async () => {
    await renderWithProviders(<GameShelf shelf={shelf} onPressGame={jest.fn()} />);

    expect(screen.getByText("Most Popular")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Hades, 2020" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Celeste, 2018" })).toBeOnTheScreen();
  });

  it("names an undated game by its title alone", async () => {
    await renderWithProviders(<GameShelf shelf={shelf} onPressGame={jest.fn()} />);

    expect(screen.getByRole("button", { name: "Unreleased" })).toBeOnTheScreen();
  });

  it("reports the game pressed", async () => {
    const onPressGame = jest.fn();
    await renderWithProviders(<GameShelf shelf={shelf} onPressGame={onPressGame} />);

    await userEvent.setup().press(screen.getByRole("button", { name: "Celeste, 2018" }));

    expect(onPressGame).toHaveBeenCalledWith(2);
  });

  it("runs the list under the side safe areas, so covers scroll beneath a tab sidebar", async () => {
    // iPhone Duo with the tab sidebar on the right.
    await renderWithProviders(<GameShelf shelf={shelf} onPressGame={jest.fn()} />, {
      insets: DUO_INSETS,
    });

    // The list spans the whole width; only its content and title are inset, so
    // the first and last covers rest clear of the sidebar.
    expect(
      shelfInsets(screen.getByRole("button", { name: "Hades, 2020" }), "Most Popular"),
    ).toEqual({
      frame: { left: undefined, right: undefined },
      content: { left: 16, right: 76 },
      title: { left: 16, right: 76 },
    });
  });
});
