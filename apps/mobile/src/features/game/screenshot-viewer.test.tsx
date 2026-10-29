import { render, screen, userEvent } from "@testing-library/react-native";

import { ScreenshotViewer } from "@/features/game/screenshot-viewer";

// The viewer reads `IOS_MAJOR` at render time, so a getter lets each test pick
// the close button's iOS 18 or iOS 26 form without reloading the module (and
// with it a second copy of React).
let mockIosMajor = 26;
jest.mock("@/ui/ios-version", () => ({
  get IOS_MAJOR() {
    return mockIosMajor;
  },
}));

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

  // iOS 26 draws the system close (X) for a bare `role="close"`; iOS 18 is
  // given the label and symbol. Both must read and act the same.
  it.each([18, 26])("closes on the close button on iOS %i", async (major) => {
    mockIosMajor = major;
    const onClose = jest.fn();
    await render(<ScreenshotViewer screenshots={SHOTS} openId="shotA" onClose={onClose} />);

    await userEvent.setup().press(screen.getByRole("button", { name: "Close screenshots" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
