import { render, screen, userEvent } from "@testing-library/react-native";

import { GameTile } from "@/components/game-tile";
import { setWindow } from "@test/window";

const props = {
  id: 3,
  title: "Celeste",
  subtitle: "2018",
  coverImageId: "co2xyz",
  onPress: jest.fn(),
};

describe("GameTile", () => {
  it("reads the title and subtitle as one button", async () => {
    await render(<GameTile {...props} />);

    expect(screen.getByRole("button", { name: "Celeste, 2018" })).toBeOnTheScreen();
    expect(screen.getByText("2018")).toBeOnTheScreen();
  });

  it("reads only the title, keeping the subtitle's line, when there is no subtitle", async () => {
    await render(<GameTile {...props} subtitle={null} />);

    expect(screen.getByRole("button", { name: "Celeste" })).toBeOnTheScreen();
    expect(screen.getByText("")).toHaveStyle({ height: 17 });
  });

  it("shows the sharper big cover", async () => {
    await render(<GameTile {...props} />);

    const [cover] = screen.container.queryAll(
      (node) => node.type === "ViewManagerAdapter_ExpoImage",
    );
    expect(cover?.props.source).toEqual([
      expect.objectContaining({ uri: expect.stringContaining("/t_cover_big_2x/co2xyz.jpg") }),
    ]);
  });

  it("reports its game's id when pressed", async () => {
    const onPress = jest.fn();
    await render(<GameTile {...props} onPress={onPress} />);

    await userEvent.setup().press(screen.getByRole("button", { name: "Celeste, 2018" }));

    expect(onPress).toHaveBeenCalledWith(3);
  });

  it("reserves two title lines and one subtitle line, so a shelf lines up", async () => {
    await render(<GameTile {...props} />);

    expect(screen.getByText("Celeste")).toHaveStyle({ lineHeight: 17, height: 34 });
    expect(screen.getByText("2018")).toHaveStyle({ lineHeight: 17, height: 17 });
  });

  it("grows those lines with the text size while the app is open", async () => {
    await render(<GameTile {...props} />);

    await setWindow({ fontScale: 2 });

    expect(screen.getByText("Celeste")).toHaveStyle({ lineHeight: 34, height: 68 });
    expect(screen.getByText("2018")).toHaveStyle({ lineHeight: 34, height: 34 });
  });
});
