import { render, screen } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { UpdatingPill } from "@/components/updating-pill";

jest.mock("react-native-safe-area-context", () => ({
  ...jest.requireActual<object>("react-native-safe-area-context"),
  useSafeAreaInsets: jest.fn(),
}));

const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");

beforeEach(() => {
  jest.mocked(useSafeAreaInsets).mockReturnValue({ top: 0, right: 0, bottom: 0, left: 0 });
  announce.mockImplementation(() => {});
});

// The pill is the label's container.
const pill = () => screen.getByText("Updating…").parent;

describe("UpdatingPill", () => {
  it("shows nothing while not updating", async () => {
    await render(<UpdatingPill visible={false} />);

    expect(screen.queryByText("Updating…")).not.toBeOnTheScreen();
  });

  it("says the list is updating", async () => {
    await render(<UpdatingPill visible />);

    expect(screen.getByText("Updating…")).toBeOnTheScreen();
  });

  it("never takes a touch from the list under it", async () => {
    await render(<UpdatingPill visible />);

    expect(pill()).toHaveProp("pointerEvents", "none");
  });

  it("floats above the tab bar and the home indicator", async () => {
    jest.mocked(useSafeAreaInsets).mockReturnValue({ top: 59, right: 0, bottom: 34, left: 0 });
    await render(<UpdatingPill visible />);

    expect(pill()).toHaveStyle({ position: "absolute", bottom: 98 });
  });

  it("is one VoiceOver element: a progress indicator named Updating", async () => {
    await render(<UpdatingPill visible />);

    expect(screen.getByRole("progressbar", { name: "Updating…" })).toBeOnTheScreen();
  });

  it("announces itself once each time it appears", async () => {
    const { rerender } = await render(<UpdatingPill visible={false} />);
    expect(announce).not.toHaveBeenCalled();

    await rerender(<UpdatingPill visible />);
    await rerender(<UpdatingPill visible />);
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith("Updating…");

    await rerender(<UpdatingPill visible={false} />);
    await rerender(<UpdatingPill visible />);
    expect(announce).toHaveBeenCalledTimes(2);
  });
});
