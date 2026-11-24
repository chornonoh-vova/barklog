import { FREE_ACTIVE_SLOTS } from "@repo/contracts";
import { render, screen, userEvent, within } from "@testing-library/react-native";

import { OnboardingScreen } from "@/features/onboarding/onboarding-screen";

const WELCOME = "Welcome to Barklog";
const WIDGETS = "Your backlog, on your Home Screen";
const FREE = "Free to use, for real";

const button = (name: string) => screen.queryByRole("button", { name });
/** The test double renders every page at once; a page is found by its value. */
const page = (value: string) => screen.getByTestId(`swiftui-tab-${value}`);

describe("OnboardingScreen", () => {
  it("pages through welcome, widgets, then free", async () => {
    await render(<OnboardingScreen onComplete={jest.fn()} />);

    const pages = within(screen.getByTestId("swiftui-tabview"))
      .getAllByTestId(/^swiftui-tab-/)
      .map((node) => node.props.testID);
    expect(pages).toEqual(["swiftui-tab-welcome", "swiftui-tab-widgets", "swiftui-tab-free"]);
  });

  it("puts the hero, heading and every feature row on the welcome page", async () => {
    await render(<OnboardingScreen onComplete={jest.fn()} />);

    const welcome = within(page("welcome"));
    expect(welcome.getByText(WELCOME)).toBeOnTheScreen();
    expect(welcome.getByText("Every game you mean to play, in one place.")).toBeOnTheScreen();
    expect(welcome.getByText("Track your backlog")).toBeOnTheScreen();
    expect(welcome.getByText("Explore what's next")).toBeOnTheScreen();
    expect(welcome.getByText("Share a clip")).toBeOnTheScreen();
  });

  it("shows the widget page with its hint", async () => {
    await render(<OnboardingScreen onComplete={jest.fn()} />);

    const widgets = within(page("widgets"));
    expect(widgets.getByText(WIDGETS)).toBeOnTheScreen();
    expect(
      widgets.getByText("Touch and hold your Home Screen, then tap Edit › Add Widget."),
    ).toBeOnTheScreen();
  });

  it("shows the free page with the cap and the slot meter", async () => {
    await render(<OnboardingScreen onComplete={jest.fn()} />);

    const free = within(page("free"));
    expect(free.getByText(FREE)).toBeOnTheScreen();
    expect(free.getByText(`${FREE_ACTIVE_SLOTS} games in progress`)).toBeOnTheScreen();
    expect(free.getByTestId("slot-meter", { includeHiddenElements: true })).toBeOnTheScreen();
  });

  it("scrolls each page's body on its own, so a tall page never pushes the actions away", async () => {
    await render(<OnboardingScreen onComplete={jest.fn()} />);

    for (const value of ["welcome", "widgets", "free"]) {
      expect(within(page(value)).getByTestId("swiftui-ScrollView")).toBeOnTheScreen();
    }
  });

  it("links IGDB below the pages, outside anything that swipes or scrolls", async () => {
    await render(<OnboardingScreen onComplete={jest.fn()} />);

    const link = screen.getByRole("link");
    expect(link.props.accessibilityHint).toBe("https://www.igdb.com");
    expect(screen.getByText("Game data from IGDB.com")).toBeOnTheScreen();
    expect(within(screen.getByTestId("swiftui-tabview")).queryByRole("link")).toBeNull();
    expect(
      within(screen.getByTestId("swiftui-tabview")).queryByRole("button", { name: "Continue" }),
    ).toBeNull();
  });

  it("walks Continue, Continue, Get Started, and completes exactly once", async () => {
    const onComplete = jest.fn();
    const user = userEvent.setup();
    await render(<OnboardingScreen onComplete={onComplete} />);

    await user.press(screen.getByRole("button", { name: "Continue" }));
    await user.press(screen.getByRole("button", { name: "Continue" }));

    expect(button("Continue")).not.toBeOnTheScreen();
    expect(onComplete).not.toHaveBeenCalled();

    await user.press(screen.getByRole("button", { name: "Get Started" }));
    await user.press(screen.getByRole("button", { name: "Get Started" }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("has no Back or Skip button: swiping is the way back", async () => {
    const user = userEvent.setup();
    await render(<OnboardingScreen onComplete={jest.fn()} />);

    for (let step = 0; step < 3; step++) {
      expect(button("Back")).not.toBeOnTheScreen();
      expect(button("Skip")).not.toBeOnTheScreen();
      expect(screen.queryByText(/See Premium/)).not.toBeOnTheScreen();
      if (step < 2) await user.press(screen.getByRole("button", { name: "Continue" }));
    }
  });

  it("puts the IGDB link below the button", async () => {
    await render(<OnboardingScreen onComplete={jest.fn()} />);

    const order = screen.container
      // Host elements only, in render order: the button, then the link.
      .queryAll(
        (node) =>
          typeof node.type === "string" &&
          ["button", "link"].includes(node.props.accessibilityRole),
      )
      .map((node) => node.props.accessibilityRole);
    expect(order).toEqual(["button", "link"]);
  });
});
