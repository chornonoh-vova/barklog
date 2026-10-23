import { render, screen, userEvent } from "@testing-library/react-native";

import { ScreenshotViewer } from "@/features/game/screenshot-viewer";

const SHOTS = ["shotA", "shotB", "shotC"];

describe("ScreenshotViewer", () => {
  it("pages through every screenshot, each announced by its place", async () => {
    await render(<ScreenshotViewer screenshots={SHOTS} openId="shotB" onClose={jest.fn()} />);

    for (const [index, imageId] of SHOTS.entries()) {
      const page = screen.getByLabelText(`Screenshot ${index + 1} of 3`);
      // The full-size transform, not the shelf's `med`.
      expect(page).toHaveProp("source", [
        { uri: `https://images.igdb.com/igdb/image/upload/t_screenshot_huge_2x/${imageId}.jpg` },
      ]);
    }
  });

  it("closes on the close button", async () => {
    const onClose = jest.fn();
    await render(<ScreenshotViewer screenshots={SHOTS} openId="shotA" onClose={onClose} />);

    await userEvent.setup().press(screen.getByRole("button", { name: "Close screenshots" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
