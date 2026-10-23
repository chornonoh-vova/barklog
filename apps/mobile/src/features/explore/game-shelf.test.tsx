import { render, screen, userEvent } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { GameShelf } from "@/features/explore/game-shelf";
import { toColumns } from "@/features/explore/shelves";
import { gameSummary } from "@test/fixtures";

const mockInsets = { top: 0, left: 0, right: 0, bottom: 0 };

jest.mock("react-native-safe-area-context", () => ({
  ...jest.requireActual<object>("react-native-safe-area-context"),
  useSafeAreaInsets: () => mockInsets,
}));

beforeEach(() => {
  Object.assign(mockInsets, { left: 0, right: 0 });
});

type Host = ReturnType<typeof screen.getByText>;

/** The horizontal list a game sits in. */
function shelfList(game: Host): Host {
  let node: Host | null = game;
  while (node !== null && !(node.type === "RCTScrollView" && node.props.horizontal)) {
    node = node.parent;
  }
  if (node === null) throw new Error("no horizontal list around the game");
  return node;
}

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
    await render(<GameShelf shelf={shelf} onPressGame={jest.fn()} />);

    expect(screen.getByText("Most Popular")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Hades, 2020" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Celeste, 2018" })).toBeOnTheScreen();
  });

  it("names an undated game by its title alone", async () => {
    await render(<GameShelf shelf={shelf} onPressGame={jest.fn()} />);

    expect(screen.getByRole("button", { name: "Unreleased" })).toBeOnTheScreen();
  });

  it("reports the game pressed", async () => {
    const onPressGame = jest.fn();
    await render(<GameShelf shelf={shelf} onPressGame={onPressGame} />);

    await userEvent.setup().press(screen.getByRole("button", { name: "Celeste, 2018" }));

    expect(onPressGame).toHaveBeenCalledWith(2);
  });

  it("runs the list under the side safe areas, so covers scroll beneath a tab sidebar", async () => {
    // iPhone Duo with the tab sidebar on the right.
    Object.assign(mockInsets, { left: 0, right: 60 });
    await render(<GameShelf shelf={shelf} onPressGame={jest.fn()} />);

    const list = shelfList(screen.getByRole("button", { name: "Hades, 2020" }));
    // The list itself spans the whole width; only its content is inset, so the
    // first and last covers rest clear of the sidebar.
    expect(StyleSheet.flatten(list.props.style)?.paddingRight).toBeUndefined();
    expect(StyleSheet.flatten(list.props.contentContainerStyle)).toMatchObject({
      paddingLeft: 16,
      paddingRight: 76,
    });
    expect(screen.getByText("Most Popular")).toHaveStyle({ paddingLeft: 16, paddingRight: 76 });
  });
});
