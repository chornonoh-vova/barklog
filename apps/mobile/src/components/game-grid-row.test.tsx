import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { GameGridRow } from "@/components/game-grid-row";

function root() {
  if (screen.root === null) throw new Error("nothing rendered");
  return screen.root;
}

describe("GameGridRow", () => {
  it("renders its children bare at one column, as a plain list", async () => {
    await render(
      <GameGridRow columns={1}>
        <Text>Hades</Text>
      </GameGridRow>,
    );

    expect(root()).toHaveTextContent("Hades");
    expect(root().type).toBe("Text");
  });

  it("lays cards side by side in equal slots", async () => {
    await render(
      <GameGridRow columns={2}>
        <Text>Hades</Text>
        <Text>Celeste</Text>
      </GameGridRow>,
    );

    expect(root()).toHaveStyle({ flexDirection: "row" });
    expect(root().children).toHaveLength(2);
    expect(screen.getByText("Hades")).toBeOnTheScreen();
    expect(screen.getByText("Celeste")).toBeOnTheScreen();
  });

  it("pads a short last row with empty slots so a lone card keeps its width", async () => {
    await render(
      <GameGridRow columns={3}>
        <Text>Hades</Text>
      </GameGridRow>,
    );

    const slots = root().children;
    expect(slots).toHaveLength(3);
    for (const slot of slots) expect(slot).toHaveStyle({ flex: 1 });
    expect(slots[0]).toHaveTextContent("Hades");
    expect(slots[1]).toBeEmptyElement();
    expect(slots[2]).toBeEmptyElement();
  });

  it("adds no empty slots when a row is over-full", async () => {
    await render(
      <GameGridRow columns={2}>
        <Text>A</Text>
        <Text>B</Text>
        <Text>C</Text>
      </GameGridRow>,
    );

    expect(root().children).toHaveLength(3);
  });
});
