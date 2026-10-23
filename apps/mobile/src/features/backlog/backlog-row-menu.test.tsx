import type { BacklogStatus } from "@repo/contracts";
import { render, screen, userEvent, within } from "@testing-library/react-native";

import { BacklogRowMenu } from "@/features/backlog/backlog-row-menu";

async function renderMenu(status: BacklogStatus = "playing") {
  const handlers = { onStatus: jest.fn(), onShare: jest.fn(), onRemove: jest.fn() };
  await render(<BacklogRowMenu name="Hades" status={status} {...handlers} />);
  return handlers;
}

describe("BacklogRowMenu", () => {
  it("is a menu named for its game, so VoiceOver tells one row's … from another's", async () => {
    await renderMenu();

    expect(screen.getByRole("menu", { name: "More, Hades" })).toBeOnTheScreen();
  });

  it("offers every status under Status, with the game's own selected", async () => {
    await renderMenu("completed");

    const statusMenu = screen.getByRole("menu", { name: "Status" });
    for (const name of ["Playing", "Waiting", "Completed", "Abandoned"]) {
      expect(within(statusMenu).getByRole("radio", { name })).toBeOnTheScreen();
    }
    expect(within(statusMenu).getByRole("radio", { name: "Completed" })).toBeSelected();
    expect(within(statusMenu).getByRole("radio", { name: "Playing" })).not.toBeSelected();
  });

  it("reports the status picked", async () => {
    const { onStatus } = await renderMenu("waiting");

    await userEvent.setup().press(screen.getByRole("radio", { name: "Abandoned" }));

    expect(onStatus).toHaveBeenCalledWith("abandoned");
  });

  it("shares the game", async () => {
    const { onShare, onRemove } = await renderMenu();

    await userEvent.setup().press(screen.getByRole("button", { name: "Share" }));

    expect(onShare).toHaveBeenCalledTimes(1);
    expect(onRemove).not.toHaveBeenCalled();
  });

  it("offers removal as a destructive action", async () => {
    const { onRemove, onShare } = await renderMenu();

    const remove = screen.getByRole("button", { name: "Remove from Backlog…" });
    expect(remove).toHaveProp("accessibilityHint", "destructive");

    await userEvent.setup().press(remove);

    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onShare).not.toHaveBeenCalled();
  });
});
