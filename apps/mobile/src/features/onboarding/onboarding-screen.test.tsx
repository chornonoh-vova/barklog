import { render, screen, userEvent } from "@testing-library/react-native";

import { OnboardingScreen } from "@/features/onboarding/onboarding-screen";

const TITLES = [
  "Welcome to Barklog",
  "Managing your game backlog",
  "Exploring games",
  "Share a video, pick the game",
  "All game data is powered by IGDB",
];

describe("OnboardingScreen", () => {
  it("shows every page's title and description", async () => {
    await render(<OnboardingScreen onComplete={jest.fn()} />);

    for (const title of TITLES) expect(screen.getByText(title)).toBeOnTheScreen();
    expect(screen.getByText(/Abandoned is a real answer/)).toBeOnTheScreen();
  });

  it("links the attribution page to IGDB", async () => {
    await render(<OnboardingScreen onComplete={jest.fn()} />);

    const link = screen.getByRole("link");
    expect(link.props.accessibilityHint).toBe("https://www.igdb.com");
    expect(screen.getByText("igdb.com")).toBeOnTheScreen();
  });

  it("skips straight to the app from the first page", async () => {
    const onComplete = jest.fn();
    await render(<OnboardingScreen onComplete={onComplete} />);

    await userEvent.setup().press(screen.getByRole("button", { name: "Skip" }));

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("pages through with Continue, then finishes with Start", async () => {
    const onComplete = jest.fn();
    const user = userEvent.setup();
    await render(<OnboardingScreen onComplete={onComplete} />);

    for (let page = 1; page < TITLES.length; page++) {
      await user.press(screen.getByRole("button", { name: "Continue" }));
    }
    expect(onComplete).not.toHaveBeenCalled();

    // The last page offers Start and no Skip.
    expect(screen.queryByRole("button", { name: "Continue" })).not.toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Skip" })).not.toBeOnTheScreen();

    await user.press(screen.getByRole("button", { name: "Start" }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
