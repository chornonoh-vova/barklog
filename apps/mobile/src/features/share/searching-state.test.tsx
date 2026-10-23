import { render, screen } from "@testing-library/react-native";

import { SearchingState } from "@/features/share/searching-state";

describe("SearchingState", () => {
  it("says the game is being worked out, with a spinner", async () => {
    await render(<SearchingState />);

    expect(screen.getByText("Working out which game this is")).toBeOnTheScreen();
    expect(screen.getByRole("progressbar")).toBeOnTheScreen();
  });
});
