import AsyncStorage from "@react-native-async-storage/async-storage";
import { render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { Observe } from "expo-observe";
import { Text } from "react-native";

import { OnboardingGate } from "@/features/onboarding/onboarding-gate";
import { markOnboardingSeen, readHasSeenOnboarding } from "@/features/onboarding/storage";
import { clerk } from "@test/mocks/native";

const renderGate = () =>
  render(
    <OnboardingGate>
      <Text>The app</Text>
    </OnboardingGate>,
  );

describe("OnboardingGate", () => {
  it("shows onboarding to a signed-out first launch, and releases the splash", async () => {
    clerk.userId = null;
    await renderGate();

    expect(await screen.findByText("Welcome to Barklog")).toBeOnTheScreen();
    expect(screen.queryByText("The app")).not.toBeOnTheScreen();
    expect(Observe.markInteractive).toHaveBeenCalled();
  });

  it("lets the app through once onboarding is done, and remembers it", async () => {
    clerk.userId = null;
    await renderGate();

    await userEvent.setup().press(await screen.findByRole("button", { name: "Skip" }));

    expect(screen.getByText("The app")).toBeOnTheScreen();
    await waitFor(async () => expect(await readHasSeenOnboarding()).toBe(true));
  });

  it("never shows onboarding again after it was seen", async () => {
    clerk.userId = null;
    await markOnboardingSeen();
    await renderGate();

    expect(await screen.findByText("The app")).toBeOnTheScreen();
    expect(screen.queryByText("Welcome to Barklog")).not.toBeOnTheScreen();
  });

  it("renders nothing while the flag and the session are unknown", async () => {
    clerk.isLoaded = false;
    clerk.userId = null;
    await renderGate();

    // The flag read resolves, but with no session yet the gate keeps waiting.
    await waitFor(() => expect(AsyncStorage.getItem).toHaveBeenCalled());
    expect(screen.queryByText("The app")).not.toBeOnTheScreen();
    expect(screen.queryByText("Welcome to Barklog")).not.toBeOnTheScreen();
  });

  it("skips onboarding on a reinstall with a restored session, and records it", async () => {
    await renderGate();

    expect(await screen.findByText("The app")).toBeOnTheScreen();
    await waitFor(async () => expect(await readHasSeenOnboarding()).toBe(true));
  });

  it("does not bury sign-in under onboarding after a restored session signs out", async () => {
    const { rerender } = await renderGate();
    await waitFor(async () => expect(await readHasSeenOnboarding()).toBe(true));

    clerk.userId = null;
    await rerender(
      <OnboardingGate>
        <Text>The app</Text>
      </OnboardingGate>,
    );

    expect(screen.getByText("The app")).toBeOnTheScreen();
    expect(screen.queryByText("Welcome to Barklog")).not.toBeOnTheScreen();
  });
});
