import { render, screen, userEvent, within } from "@testing-library/react-native";

import { EntryActions } from "@/features/game/entry-actions";
import { backlogEntry } from "@test/fixtures";
import { setWindow } from "@test/window";

async function renderActions(entry: Parameters<typeof EntryActions>[0]["entry"]) {
  const handlers = { onMove: jest.fn(), onRate: jest.fn() };
  await render(<EntryActions entry={entry} {...handlers} />);
  return handlers;
}

describe("EntryActions", () => {
  it("offers to add a game that is not in the backlog, and no rating yet", async () => {
    await renderActions(null);

    const add = screen.getByRole("menu", { name: "Add to Backlog" });
    for (const name of ["Playing", "Waiting", "Completed", "Abandoned"]) {
      expect(within(add).getByRole("radio", { name })).not.toBeSelected();
    }
    expect(screen.queryByRole("menu", { name: "Rate this game" })).not.toBeOnTheScreen();
  });

  it("adds the game with the status picked", async () => {
    const { onMove } = await renderActions(null);

    await userEvent.setup().press(screen.getByRole("radio", { name: "Waiting" }));

    expect(onMove).toHaveBeenCalledWith("waiting");
  });

  it("labels the status menu with the game's status and selects it", async () => {
    const { onMove } = await renderActions(backlogEntry({ status: "playing" }));

    const status = screen.getByRole("menu", { name: "Playing" });
    expect(within(status).getByRole("radio", { name: "Playing" })).toBeSelected();

    await userEvent.setup().press(within(status).getByRole("radio", { name: "Completed" }));

    expect(onMove).toHaveBeenCalledWith("completed");
  });

  it("offers a rating once the game has a status", async () => {
    const { onRate } = await renderActions(backlogEntry({ status: "completed", rating: null }));

    const rate = screen.getByRole("menu", { name: "Rate this game" });
    expect(within(rate).getByText("Rate")).toBeOnTheScreen();
    expect(within(rate).getByRole("radio", { name: "No rating" })).toBeSelected();
    for (let value = 1; value <= 10; value++) {
      expect(within(rate).getByRole("radio", { name: String(value) })).toBeOnTheScreen();
    }

    await userEvent.setup().press(within(rate).getByRole("radio", { name: "8" }));

    expect(onRate).toHaveBeenCalledWith(8);
  });

  it("shows the rating given, spoken out of ten, and clears it with No rating", async () => {
    const { onRate } = await renderActions(backlogEntry({ status: "completed", rating: 7 }));

    const rate = screen.getByRole("menu", { name: "Rating, 7 out of 10" });
    expect(within(rate).getByRole("radio", { name: "7" })).toBeSelected();

    await userEvent.setup().press(within(rate).getByRole("radio", { name: "No rating" }));

    expect(onRate).toHaveBeenCalledWith(null);
  });

  it("stacks the two buttons at accessibility text sizes", async () => {
    await renderActions(backlogEntry({ status: "playing" }));
    expect(screen.getByTestId("swiftui-HStack")).toBeOnTheScreen();

    await setWindow({ fontScale: 2 });

    expect(screen.getByTestId("swiftui-VStack")).toBeOnTheScreen();
    expect(screen.queryByTestId("swiftui-HStack")).not.toBeOnTheScreen();
    expect(screen.getByRole("menu", { name: "Rate this game" })).toBeOnTheScreen();
  });
});
