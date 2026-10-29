import { render, screen } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";

import { UpdatingPill } from "@/components/updating-pill";
import { renderWithProviders } from "@test/render";
import { PHONE_INSETS } from "@test/window";

let announce: jest.SpiedFunction<typeof AccessibilityInfo.announceForAccessibility>;

beforeEach(() => {
  announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => {});
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

  it("floats just above the bottom inset, which holds the tab bar when there is one", async () => {
    await renderWithProviders(<UpdatingPill visible />, { insets: PHONE_INSETS });

    expect(pill()).toHaveStyle({ position: "absolute", bottom: 50 });
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
