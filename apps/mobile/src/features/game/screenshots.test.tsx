import { render, screen, userEvent } from "@testing-library/react-native";

import { Screenshots } from "@/features/game/screenshots";

describe("Screenshots", () => {
  it("renders nothing for a game without screenshots", async () => {
    await render(<Screenshots screenshots={[]} />);

    expect(screen.queryByText("Screenshots")).not.toBeOnTheScreen();
  });

  it("shows each screenshot as a button that says it opens full screen", async () => {
    await render(<Screenshots screenshots={["shotA", "shotB"]} />);

    expect(screen.getByText("Screenshots")).toBeOnTheScreen();
    for (const name of ["Screenshot 1 of 2", "Screenshot 2 of 2"]) {
      expect(screen.getByRole("button", { name })).toHaveProp(
        "accessibilityHint",
        "Opens full screen",
      );
    }
    expect(screen.queryByRole("button", { name: "Close screenshots" })).not.toBeOnTheScreen();
  });

  it("opens the viewer on a tap, and closes it again", async () => {
    const user = userEvent.setup();
    await render(<Screenshots screenshots={["shotA", "shotB"]} />);

    await user.press(screen.getByRole("button", { name: "Screenshot 2 of 2" }));

    const close = screen.getByRole("button", { name: "Close screenshots" });
    expect(close).toBeOnTheScreen();

    await user.press(close);

    expect(screen.queryByRole("button", { name: "Close screenshots" })).not.toBeOnTheScreen();
  });
});
