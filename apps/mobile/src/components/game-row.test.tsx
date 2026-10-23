import { fireEvent, render, screen, userEvent } from "@testing-library/react-native";
import { PlatformColor, Pressable, Text } from "react-native";

import { GameRow } from "@/components/game-row";

const props = {
  id: 7,
  title: "Hades",
  subtitle: "2020 · ★ 93",
  coverImageId: "co1abc",
  onPress: jest.fn(),
};

const symbols = () =>
  screen.container
    .queryAll((node) => node.type === "ViewManagerAdapter_SymbolModule")
    .map((node) => node.props.name as string);

/** A finger down and held: Pressable's own responder grant, short of a release. */
const pressIn = (element: Parameters<typeof fireEvent>[0]) =>
  fireEvent(element, "responderGrant", {
    persist: jest.fn(),
    currentTarget: { measure: jest.fn() },
    nativeEvent: {
      timestamp: 0,
      pageX: 0,
      pageY: 0,
      locationX: 0,
      locationY: 0,
      touches: [],
      changedTouches: [],
    },
  });

const menu = (onPress = jest.fn()) => (
  <Pressable accessibilityRole="button" accessibilityLabel="More" onPress={onPress}>
    <Text>…</Text>
  </Pressable>
);

describe("GameRow", () => {
  it("reads the title and subtitle as one button", async () => {
    await render(<GameRow {...props} />);

    expect(screen.getByRole("button", { name: "Hades, 2020 · ★ 93" })).toBeOnTheScreen();
    expect(screen.getByText("Hades")).toBeOnTheScreen();
    expect(screen.getByText("2020 · ★ 93")).toBeOnTheScreen();
  });

  it("speaks the spoken subtitle in place of the glyphs it shows", async () => {
    await render(<GameRow {...props} spokenSubtitle="2020, rated 93" />);

    expect(screen.getByRole("button", { name: "Hades, 2020, rated 93" })).toBeOnTheScreen();
    expect(screen.getByText("2020 · ★ 93")).toBeOnTheScreen();
  });

  it("shows and reads only the title when there is no subtitle", async () => {
    await render(<GameRow {...props} subtitle={null} />);

    expect(screen.getByRole("button", { name: "Hades" })).toHaveTextContent("Hades");
  });

  it("gives the subtitle more lines when asked, for accessibility text sizes", async () => {
    await render(<GameRow {...props} />);
    expect(screen.getByText("2020 · ★ 93")).toHaveProp("numberOfLines", 1);

    await render(<GameRow {...props} subtitleLines={2} />);
    expect(screen.getByText("2020 · ★ 93")).toHaveProp("numberOfLines", 2);
  });

  it("reports its game's id when pressed", async () => {
    const onPress = jest.fn();
    await render(<GameRow {...props} onPress={onPress} />);

    await userEvent.setup().press(screen.getByRole("button", { name: /^Hades/ }));

    expect(onPress).toHaveBeenCalledWith(7);
  });

  it("shows the cover", async () => {
    await render(<GameRow {...props} />);

    const [cover] = screen.container.queryAll(
      (node) => node.type === "ViewManagerAdapter_ExpoImage",
    );
    expect(cover?.props.source).toEqual([
      expect.objectContaining({ uri: expect.stringContaining("/t_cover_small_2x/co1abc.jpg") }),
    ]);
  });

  describe("as a list row", () => {
    it("ends in a chevron", async () => {
      await render(<GameRow {...props} />);

      expect(symbols()).toEqual(["chevron.right"]);
    });

    it("highlights while pressed", async () => {
      await render(<GameRow {...props} />);
      const row = screen.getByRole("button", { name: /^Hades/ });
      expect(row).toHaveStyle({ backgroundColor: PlatformColor("systemBackground") });

      await pressIn(row);

      expect(screen.getByRole("button", { name: /^Hades/ })).toHaveStyle({
        backgroundColor: PlatformColor("secondarySystemGroupedBackground"),
      });
    });
  });

  describe("as a grid card", () => {
    it("is a rounded card with no chevron", async () => {
      await render(<GameRow {...props} variant="card" />);

      expect(screen.getByRole("button", { name: /^Hades/ })).toHaveStyle({ borderRadius: 12 });
      expect(symbols()).toEqual([]);
    });

    it("highlights while pressed", async () => {
      await render(<GameRow {...props} variant="card" />);
      const card = screen.getByRole("button", { name: /^Hades/ });
      expect(card).toHaveStyle({
        backgroundColor: PlatformColor("secondarySystemGroupedBackground"),
      });

      await pressIn(card);

      expect(screen.getByRole("button", { name: /^Hades/ })).toHaveStyle({
        backgroundColor: PlatformColor("tertiarySystemGroupedBackground"),
      });
    });

    it("keeps its grid slot when it carries a menu", async () => {
      await render(<GameRow {...props} variant="card" menu={menu()} />);

      expect(screen.root).toHaveStyle({ flex: 1 });
      expect(screen.getByRole("button", { name: "More" })).toBeOnTheScreen();
    });
  });

  describe("with a menu", () => {
    it("shows the menu in place of the chevron", async () => {
      await render(<GameRow {...props} menu={menu()} />);

      expect(screen.getByRole("button", { name: "More" })).toBeOnTheScreen();
      expect(symbols()).toEqual([]);
    });

    it("opens the menu without also opening the game", async () => {
      const onPress = jest.fn();
      const onMenu = jest.fn();
      await render(<GameRow {...props} onPress={onPress} menu={menu(onMenu)} />);

      await userEvent.setup().press(screen.getByRole("button", { name: "More" }));

      expect(onMenu).toHaveBeenCalledTimes(1);
      expect(onPress).not.toHaveBeenCalled();
    });

    it("still opens the game from the row", async () => {
      const onPress = jest.fn();
      await render(<GameRow {...props} onPress={onPress} menu={menu()} />);

      await userEvent.setup().press(screen.getByRole("button", { name: /^Hades/ }));

      expect(onPress).toHaveBeenCalledWith(7);
    });

    it("leaves room on the trailing edge for the menu button", async () => {
      await render(<GameRow {...props} menu={menu()} />);

      expect(screen.getByRole("button", { name: /^Hades/ })).toHaveStyle({ paddingRight: 52 });
    });
  });
});
