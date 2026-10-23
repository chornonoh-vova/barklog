import { render, screen, userEvent } from "@testing-library/react-native";

import { ExpandableSummary } from "@/features/game/expandable-summary";

const SUMMARY = "A god of the underworld's son fights his way out.";

describe("ExpandableSummary", () => {
  it("shows the summary clipped to three lines, with MORE to read on", async () => {
    await render(<ExpandableSummary summary={SUMMARY} />);

    expect(screen.getByText("Summary")).toBeOnTheScreen();
    expect(screen.getByText(SUMMARY)).toHaveProp("numberOfLines", 3);
    expect(screen.getByRole("button", { name: "MORE" })).toBeOnTheScreen();
  });

  it("expands on MORE and collapses again on LESS", async () => {
    const user = userEvent.setup();
    await render(<ExpandableSummary summary={SUMMARY} />);

    await user.press(screen.getByRole("button", { name: "MORE" }));

    expect(screen.getByText(SUMMARY)).not.toHaveProp("numberOfLines", 3);
    expect(screen.queryByRole("button", { name: "MORE" })).not.toBeOnTheScreen();

    await user.press(screen.getByRole("button", { name: "LESS" }));

    expect(screen.getByText(SUMMARY)).toHaveProp("numberOfLines", 3);
  });
});
