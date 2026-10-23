import { render, screen, userEvent } from "@testing-library/react-native";

import { EmptyState } from "@/components/empty-state";
import { nativeView, nativeViews } from "@test/queries";

const content = {
  title: "Nothing here",
  systemImage: "tray" as const,
  description: "Add a game to get started.",
};

describe("EmptyState", () => {
  it("shows the title and description", async () => {
    await render(<EmptyState {...content} />);

    expect(screen.getByText("Nothing here")).toBeOnTheScreen();
    expect(screen.getByText("Add a game to get started.")).toBeOnTheScreen();
  });

  it("shows the symbol, hidden from VoiceOver, when there is no mascot", async () => {
    await render(<EmptyState {...content} />);

    const symbol = nativeView("ViewManagerAdapter_SymbolModule");
    expect(symbol.props).toEqual(
      expect.objectContaining({ name: "tray", size: 64, accessibilityElementsHidden: true }),
    );
    expect(nativeViews("ViewManagerAdapter_ExpoImage")).toHaveLength(0);
  });

  it("shows the mascot in place of the symbol when given an illustration", async () => {
    await render(<EmptyState {...content} illustration="backlog" />);

    const mascot = nativeView("ViewManagerAdapter_ExpoImage");
    expect(mascot.props.source).toEqual([
      { testUri: expect.stringMatching(/barklog-mascot-backlog\.webp$/) },
    ]);
    expect(nativeViews("ViewManagerAdapter_SymbolModule")).toHaveLength(0);
  });

  it("offers no buttons without actions", async () => {
    await render(<EmptyState {...content} />);

    expect(screen.queryByRole("button")).not.toBeOnTheScreen();
  });

  it("runs the primary and secondary actions", async () => {
    const add = jest.fn();
    const explore = jest.fn();
    const user = userEvent.setup();
    await render(
      <EmptyState
        {...content}
        action={{ label: "Find a Game", onPress: add }}
        secondaryAction={{ label: "Explore", onPress: explore }}
      />,
    );

    await user.press(screen.getByRole("button", { name: "Find a Game" }));
    expect(add).toHaveBeenCalledTimes(1);
    expect(explore).not.toHaveBeenCalled();

    await user.press(screen.getByRole("button", { name: "Explore" }));
    expect(explore).toHaveBeenCalledTimes(1);
  });

  it("can offer only the secondary action", async () => {
    await render(
      <EmptyState {...content} secondaryAction={{ label: "Explore", onPress: jest.fn() }} />,
    );

    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Explore" })).toBeOnTheScreen();
  });

  it("fills the screen only when asked to", async () => {
    await render(<EmptyState {...content} />);
    expect(screen.root).not.toHaveStyle({ flex: 1 });

    await render(<EmptyState {...content} fullscreen />);
    expect(screen.root).toHaveStyle({ flex: 1 });
  });
});
